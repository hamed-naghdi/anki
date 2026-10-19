using System.Net;
using Dictionary.Api.Http.Cloudflare;
using Microsoft.Extensions.Logging.Abstractions;

namespace Dictionary.Api.Tests.Http;

public class CloudflareClearanceHandlerTests
{
    private static readonly Uri Site = new("https://www.example.test/");
    private const string BrowserUserAgent = "TestBrowser/1.0";

    /// <summary>Lets a request through only with the currently accepted clearance cookie and the browser's User-Agent; otherwise answers with Cloudflare's challenge.</summary>
    private sealed class FakeSite : HttpMessageHandler
    {
        public string? AcceptedClearance { get; set; }
        public int Challenges { get; private set; }
        public int Requests { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            if (request.RequestUri!.AbsolutePath == "/missing")
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden));
            }

            var cookies = request.Headers.TryGetValues("Cookie", out var values) ? string.Join("; ", values) : "";
            var userAgent = string.Join(" ", request.Headers.UserAgent);
            if (AcceptedClearance is not null && cookies.Contains($"cf_clearance={AcceptedClearance}") && userAgent == BrowserUserAgent)
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("real page") });
            }

            Challenges++;
            var challenge = new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("Just a moment...") };
            challenge.Headers.Add("cf-mitigated", "challenge");
            return Task.FromResult(challenge);
        }
    }

    /// <summary>Each solve hands out a new clearance token; by default the site starts accepting it, like the real thing.</summary>
    private sealed class FakeBrowser(FakeSite site) : ICloudflareBrowser
    {
        public int Solves { get; private set; }
        public int Pages { get; private set; }
        public bool SiteAcceptsClearance { get; set; } = true;
        public TimeSpan ClearanceLifetime { get; set; } = TimeSpan.FromHours(1);
        public Exception? FailWith { get; set; }
        public TaskCompletionSource? Gate { get; set; }

        public async Task<CloudflareClearance> SolveAsync(CancellationToken cancellationToken)
        {
            Solves++;
            if (Gate is not null)
            {
                await Gate.Task;
            }

            if (FailWith is not null)
            {
                throw FailWith;
            }

            var token = $"token-{Solves}";
            if (SiteAcceptsClearance)
            {
                site.AcceptedClearance = token;
            }

            var cookie = new Cookie("cf_clearance", token, "/", Site.Host) { Expires = DateTime.Now + ClearanceLifetime };
            return new CloudflareClearance(BrowserUserAgent, [cookie]);
        }

        public Task<string> GetHtmlAsync(Uri url, CancellationToken cancellationToken)
        {
            Pages++;
            return Task.FromResult("page from browser");
        }
    }

    private static CloudflareClearanceStore NewStore(FakeBrowser browser, string? cachePath = null) =>
        new(Site, browser, cachePath, NullLogger<CloudflareClearanceStore>.Instance);

    private static HttpClient NewClient(CloudflareClearanceStore store, FakeBrowser browser, FakeSite site) =>
        new(new CloudflareClearanceHandler(store, browser, NullLogger<CloudflareClearanceHandler>.Instance) { InnerHandler = site })
        {
            BaseAddress = Site,
        };

    [Fact]
    public async Task FirstRequest_SolvesOnce_ThenEveryRequestReusesTheClearance()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site);
        var client = NewClient(NewStore(browser), browser, site);

        Assert.Equal("real page", await client.GetStringAsync("a"));
        Assert.Equal("real page", await client.GetStringAsync("b"));

        Assert.Equal(1, browser.Solves);
        Assert.Equal(0, site.Challenges);
        Assert.Equal(0, browser.Pages);
    }

    [Fact]
    public async Task StaleClearance_IsRenewedAndTheRequestRetriedOnce()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site);
        var client = NewClient(NewStore(browser), browser, site);
        await client.GetStringAsync("a");

        site.AcceptedClearance = "revoked"; // expired early, or the IP changed
        Assert.Equal("real page", await client.GetStringAsync("b"));

        Assert.Equal(2, browser.Solves);
        Assert.Equal(1, site.Challenges);
    }

    [Fact]
    public async Task PlainForbidden_IsTheSitesRealAnswer_NotAChallenge()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site);
        var client = NewClient(NewStore(browser), browser, site);

        var response = await client.GetAsync("missing");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, browser.Solves); // only the initial one - the 403 didn't trigger a re-solve
        Assert.Equal(0, browser.Pages);
    }

    [Fact]
    public async Task ChallengedEvenWithAFreshClearance_FallsBackToTheBrowser_AndStaysThere()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site) { SiteAcceptsClearance = false };
        var client = NewClient(NewStore(browser), browser, site);

        Assert.Equal("page from browser", await client.GetStringAsync("a"));
        var requestsBefore = site.Requests;
        Assert.Equal("page from browser", await client.GetStringAsync("b"));

        Assert.Equal(2, browser.Solves); // the initial one, plus one renewal before giving up on plain HTTP
        Assert.Equal(2, browser.Pages);
        Assert.Equal(requestsBefore, site.Requests); // the second page went straight to the browser
    }

    [Fact]
    public async Task ConcurrentRequestsNeedingAClearance_ShareOneSolve()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site) { Gate = new TaskCompletionSource() };
        var client = NewClient(NewStore(browser), browser, site);

        var lookups = Enumerable.Range(0, 5).Select(i => client.GetStringAsync($"page-{i}")).ToList();
        await Task.Delay(50);
        browser.Gate.SetResult();
        var pages = await Task.WhenAll(lookups);

        Assert.All(pages, page => Assert.Equal("real page", page));
        Assert.Equal(1, browser.Solves);
    }

    [Fact]
    public async Task StaleClearanceSeenByConcurrentRequests_IsRenewedOnlyOnce()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site);
        var client = NewClient(NewStore(browser), browser, site);
        await client.GetStringAsync("a");

        site.AcceptedClearance = "revoked";
        browser.Gate = new TaskCompletionSource();
        var lookups = Enumerable.Range(0, 5).Select(i => client.GetStringAsync($"page-{i}")).ToList();
        await Task.Delay(50);
        browser.Gate.SetResult();
        await Task.WhenAll(lookups);

        Assert.Equal(2, browser.Solves);
    }

    [Fact]
    public async Task FailedSolve_IsNotRetriedOnEveryLookupDuringTheCooldown()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site) { FailWith = new HttpRequestException("blocked by an interactive check") };
        var client = NewClient(NewStore(browser), browser, site);

        var first = await Assert.ThrowsAsync<HttpRequestException>(() => client.GetStringAsync("a"));
        var second = await Assert.ThrowsAsync<HttpRequestException>(() => client.GetStringAsync("b"));

        Assert.Contains("blocked by an interactive check", first.Message);
        Assert.Contains("blocked by an interactive check", second.Message);
        Assert.Equal(1, browser.Solves);
        Assert.Equal(0, site.Requests);
    }

    [Fact]
    public async Task ClearanceAboutToExpire_IsRenewedBeforeItRunsOut()
    {
        var site = new FakeSite();
        var browser = new FakeBrowser(site) { ClearanceLifetime = TimeSpan.FromMinutes(1) };
        var client = NewClient(NewStore(browser), browser, site);

        await client.GetStringAsync("a");
        await client.GetStringAsync("b");

        Assert.Equal(2, browser.Solves);
        Assert.Equal(0, site.Challenges); // renewed ahead of time, never caught out
    }

    [Fact]
    public async Task SavedClearance_SurvivesARestart()
    {
        var cachePath = Path.Combine(Path.GetTempPath(), $"cloudflare-{Guid.NewGuid():N}.json");
        try
        {
            var site = new FakeSite();
            var firstRun = new FakeBrowser(site);
            using (var store = NewStore(firstRun, cachePath))
            {
                await NewClient(store, firstRun, site).GetStringAsync("a");
            }

            var secondRun = new FakeBrowser(site);
            Assert.Equal("real page", await NewClient(NewStore(secondRun, cachePath), secondRun, site).GetStringAsync("b"));
            Assert.Equal(0, secondRun.Solves);
        }
        finally
        {
            File.Delete(cachePath);
        }
    }
}
