namespace Dictionary.Api.Http;

/// <summary>
/// Adds a rotating User-Agent/Accept-Language and a small randomized delay between requests,
/// so scraping dictionary sites looks like ordinary browser traffic instead of a bot hammering them.
/// </summary>
public sealed class PoliteHttpMessageHandler(int minDelayMs = 2000, int maxDelayMs = 5000) : DelegatingHandler
{
    private static readonly string[] UserAgents =
    [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/110.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15",
    ];

    private static readonly string[] AcceptLanguages =
    [
        "en-US,en;q=0.9",
        "en-GB,en;q=0.9",
        "en;q=0.9",
    ];

    private DateTimeOffset _lastRequestAt = DateTimeOffset.MinValue;

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        await WaitForNextRequestAsync(cancellationToken);

        request.Headers.UserAgent.Clear();
        request.Headers.TryAddWithoutValidation("User-Agent", Pick(UserAgents));
        request.Headers.TryAddWithoutValidation("Accept-Language", Pick(AcceptLanguages));
        request.Headers.TryAddWithoutValidation("Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");

        return await base.SendAsync(request, cancellationToken);
    }

    private async Task WaitForNextRequestAsync(CancellationToken cancellationToken)
    {
        var randomDelay = TimeSpan.FromMilliseconds(Random.Shared.Next(minDelayMs, maxDelayMs + 1));
        var elapsedSinceLastRequest = DateTimeOffset.UtcNow - _lastRequestAt;
        var delayNeeded = randomDelay - elapsedSinceLastRequest;

        if (delayNeeded > TimeSpan.Zero)
        {
            await Task.Delay(delayNeeded, cancellationToken);
        }

        _lastRequestAt = DateTimeOffset.UtcNow;
    }

    private static string Pick(string[] values) => values[Random.Shared.Next(values.Length)];
}
