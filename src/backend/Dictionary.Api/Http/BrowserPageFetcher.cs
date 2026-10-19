using System.Net;
using Microsoft.Playwright;

namespace Dictionary.Api.Http;

public sealed class BrowserPageFetcherOptions
{
    /// <summary>
    /// Headless Chromium (and Firefox) never get past Cloudflare's bot challenge - only a real, headed
    /// window does - so this stays false unless the site stops challenging. The headed window is parked
    /// off-screen, so it doesn't get in the way.
    /// </summary>
    public bool Headless { get; set; }

    /// <summary>How long to wait for the browser to clear a Cloudflare challenge before giving up.</summary>
    public int ChallengeTimeoutSeconds { get; set; } = 20;

    public int MinDelayMs { get; set; } = 2000;

    public int MaxDelayMs { get; set; } = 5000;
}

/// <summary>
/// Loads pages in a real Chromium (via Playwright) for sites behind Cloudflare's JavaScript challenge,
/// which plain <see cref="HttpClient"/> can never pass: the first response is a 403 "Just a moment..."
/// page whose script has to run before Cloudflare sets a <c>cf_clearance</c> cookie and reloads into
/// the real page. One browser context lives for the app's lifetime, so that cookie is earned once and
/// every later lookup loads directly.
/// </summary>
public sealed class BrowserPageFetcher(
    Uri baseAddress,
    BrowserPageFetcherOptions options,
    ILogger<BrowserPageFetcher> logger) : IHtmlPageFetcher, IAsyncDisposable
{
    // One page at a time: keeps the politeness delay meaningful and the browser's footprint small.
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IPlaywright? _playwright;
    private IBrowser? _browser;
    private IBrowserContext? _context;
    private DateTimeOffset _lastRequestAt = DateTimeOffset.MinValue;

    public async Task<string> GetHtmlAsync(string url, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            await WaitForNextRequestAsync(cancellationToken);

            var context = await GetContextAsync();
            var page = await context.NewPageAsync();
            try
            {
                return await LoadAsync(page, new Uri(baseAddress, url), cancellationToken);
            }
            finally
            {
                await page.CloseAsync();
            }
        }
        catch (Exception ex) when (ex is PlaywrightException or TimeoutException)
        {
            throw new HttpRequestException($"Browser failed to load {url}: {ex.Message}", ex);
        }
        finally
        {
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
        // so the parsers (and their saved fixtures) don't care which fetcher was used.
        return await response.TextAsync();
    }

    private static bool IsChallenge(IResponse response) =>
        response.Headers.TryGetValue("cf-mitigated", out var value) && value == "challenge";

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

    private async Task WaitForNextRequestAsync(CancellationToken cancellationToken)
    {
        var randomDelay = TimeSpan.FromMilliseconds(Random.Shared.Next(options.MinDelayMs, options.MaxDelayMs + 1));
        var delayNeeded = randomDelay - (DateTimeOffset.UtcNow - _lastRequestAt);

        if (delayNeeded > TimeSpan.Zero)
        {
            await Task.Delay(delayNeeded, cancellationToken);
        }

        _lastRequestAt = DateTimeOffset.UtcNow;
    }

    private async Task CloseBrowserAsync()
    {
        if (_browser is not null)
        {
            await _browser.CloseAsync();
        }

        _browser = null;
        _context = null;
    }

    public async ValueTask DisposeAsync()
    {
        await CloseBrowserAsync();
        _playwright?.Dispose();
        _gate.Dispose();
    }
}
