using System.Net;
using Microsoft.Playwright;
using Cookie = System.Net.Cookie;

namespace Dictionary.Api.Http.Cloudflare;

public sealed class CloudflareOptions
{
    /// <summary>
    /// Headless Chromium (and Firefox) never get past Cloudflare's bot challenge - only a real, headed
    /// window does - so this stays false unless the site stops challenging. The headed window is parked
    /// off-screen and only open while a challenge is being solved.
    /// </summary>
    public bool Headless { get; set; }

    /// <summary>How long to wait for the browser to clear a Cloudflare challenge before giving up.</summary>
    public int ChallengeTimeoutSeconds { get; set; } = 20;

    /// <summary>
    /// Where the earned clearance is kept so an app restart doesn't need a new solve; empty disables it.
    /// It's a session credential for the site, so it lives outside the repo.
    /// </summary>
    public string? CachePath { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "anki-dictionary", "oxford-cloudflare.json");
}

/// <summary>What a plain HTTP client needs to be let through: the cookies Cloudflare set for the browser, and that browser's exact User-Agent (the clearance cookie is only honoured alongside it).</summary>
public sealed record CloudflareClearance(string UserAgent, IReadOnlyList<Cookie> Cookies);

public interface ICloudflareBrowser
{
    /// <summary>Loads the site's home page until Cloudflare lets the browser through, and hands back its clearance.</summary>
    Task<CloudflareClearance> SolveAsync(CancellationToken cancellationToken);

    /// <summary>Loads one page entirely in the browser - the fallback for when even a fresh clearance doesn't get plain HTTP through.</summary>
    Task<string> GetHtmlAsync(Uri url, CancellationToken cancellationToken);
}

/// <summary>
/// A real Chromium (via Playwright) for sites behind Cloudflare's JavaScript challenge, which plain
/// <see cref="HttpClient"/> can never pass: the first response is a 403 "Just a moment..." page whose
/// script has to run before Cloudflare sets a <c>cf_clearance</c> cookie and reloads into the real page.
/// </summary>
public sealed class CloudflareBrowser(
    Uri siteAddress,
    CloudflareOptions options,
    ILogger<CloudflareBrowser> logger) : ICloudflareBrowser, IAsyncDisposable
{
    // One page at a time keeps the browser's footprint small; callers are throttled upstream anyway.
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IPlaywright? _playwright;
    private IBrowser? _browser;
    private IBrowserContext? _context;

    public Task<CloudflareClearance> SolveAsync(CancellationToken cancellationToken) =>
        // A solve is needed once per clearance lifetime, so the browser isn't kept around after it.
        WithPageAsync(closeBrowserAfter: true, cancellationToken, async (context, page) =>
        {
            await LoadAsync(page, siteAddress, cancellationToken);
            var userAgent = await page.EvaluateAsync<string>("navigator.userAgent");
            var cookies = await context.CookiesAsync([siteAddress.ToString()]);
            return new CloudflareClearance(userAgent, cookies.Select(ToCookie).ToList());
        });

    public Task<string> GetHtmlAsync(Uri url, CancellationToken cancellationToken) =>
        WithPageAsync(closeBrowserAfter: false, cancellationToken, (_, page) => LoadAsync(page, url, cancellationToken));

    private async Task<T> WithPageAsync<T>(
        bool closeBrowserAfter, CancellationToken cancellationToken, Func<IBrowserContext, IPage, Task<T>> action)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var context = await GetContextAsync();
            var page = await context.NewPageAsync();
            try
            {
                return await action(context, page);
            }
            finally
            {
                await page.CloseAsync();
            }
        }
        catch (Exception ex) when (ex is PlaywrightException or TimeoutException)
        {
            throw new HttpRequestException($"Browser failed to load {siteAddress.Host}: {ex.Message}", ex);
        }
        finally
        {
            if (closeBrowserAfter)
            {
                await CloseBrowserAsync();
            }

            _gate.Release();
        }
    }

    private async Task<string> LoadAsync(IPage page, Uri url, CancellationToken cancellationToken)
    {
        // The page we want is the first main-frame document that is neither a redirect (the search
        // URL 302s to the entry) nor Cloudflare's challenge - which, when it shows up, is replaced by
        // a reload into the real page once its script has passed.
        var realPage = new TaskCompletionSource<IResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
        page.Response += (_, response) =>
        {
            if (response.Frame == page.MainFrame
                && response.Request.IsNavigationRequest
                && response.Status is < 300 or >= 400
                && !IsChallenge(response))
            {
                realPage.TrySetResult(response);
            }
        };

        var firstResponse = await page.GotoAsync(url.ToString(), new() { WaitUntil = WaitUntilState.Commit });
        if (firstResponse is not null && IsChallenge(firstResponse))
        {
            logger.LogInformation("Cloudflare challenge on {Url}, waiting for the browser to clear it", url);
        }

        IResponse response;
        try
        {
            response = await realPage.Task.WaitAsync(TimeSpan.FromSeconds(options.ChallengeTimeoutSeconds), cancellationToken);
        }
        catch (TimeoutException)
        {
            throw new HttpRequestException(
                $"{url.Host} is blocking automated requests (Cloudflare challenge not cleared within {options.ChallengeTimeoutSeconds}s).",
                null,
                HttpStatusCode.Forbidden);
        }

        if (!response.Ok)
        {
            throw new HttpRequestException(
                $"Response status code does not indicate success: {response.Status} ({response.StatusText}).",
                null,
                (HttpStatusCode)response.Status);
        }

        // The server's own HTML, not the live DOM - the same markup HttpClient would have received,
        // so the parsers (and their saved fixtures) don't care which path a page came through.
        return await response.TextAsync();
    }

    private static bool IsChallenge(IResponse response) =>
        response.Headers.TryGetValue("cf-mitigated", out var value) && value == "challenge";

    private static Cookie ToCookie(BrowserContextCookiesResult cookie) => new(cookie.Name, cookie.Value, cookie.Path, cookie.Domain)
    {
        Secure = cookie.Secure,
        HttpOnly = cookie.HttpOnly,
        // Playwright reports seconds since the epoch, or -1 for a session cookie; Cookie wants local time.
        Expires = cookie.Expires > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds((long)(cookie.Expires * 1000)).LocalDateTime
            : DateTime.MinValue,
    };

    private async Task<IBrowserContext> GetContextAsync()
    {
        if (_context is not null && _browser is { IsConnected: true })
        {
            return _context;
        }

        // First use, or the browser crashed/was closed - start over with a fresh one.
        await CloseBrowserAsync();
        _playwright ??= await Playwright.CreateAsync();
        _browser = await LaunchAsync(_playwright);
        _context = await _browser.NewContextAsync();
        return _context;
    }

    private async Task<IBrowser> LaunchAsync(IPlaywright playwright)
    {
        var launchOptions = new BrowserTypeLaunchOptions
        {
            Headless = options.Headless,
            Args =
            [
                "--disable-blink-features=AutomationControlled",
                "--window-position=-32000,-32000",
                "--window-size=800,600",
            ],
        };

        try
        {
            return await playwright.Chromium.LaunchAsync(launchOptions);
        }
        catch (PlaywrightException ex) when (ex.Message.Contains("Executable doesn't exist"))
        {
            // Playwright's Chromium build is a separate ~150 MB download, not part of the NuGet package.
            logger.LogInformation("Playwright's Chromium isn't installed yet - downloading it (one-time)");
            var exitCode = Microsoft.Playwright.Program.Main(["install", "chromium"]);
            if (exitCode != 0)
            {
                throw new PlaywrightException($"'playwright install chromium' failed with exit code {exitCode}.");
            }

            return await playwright.Chromium.LaunchAsync(launchOptions);
        }
    }

    private async Task CloseBrowserAsync()
    {
        var browser = _browser;
        _browser = null;
        _context = null;
        if (browser is null)
        {
            return;
        }

        try
        {
            await browser.CloseAsync();
        }
        catch (PlaywrightException ex)
        {
            logger.LogDebug(ex, "Browser was already gone when closing it");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await CloseBrowserAsync();
        _playwright?.Dispose();
        _gate.Dispose();
    }
}
