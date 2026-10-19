namespace Dictionary.Api.Http;

/// <summary>
/// Fetches a page's raw HTML. Implementations report failures the same way <see cref="HttpClient"/> does -
/// as an <see cref="HttpRequestException"/> - so providers don't care whether a page came over plain HTTP
/// or through a real browser.
/// </summary>
public interface IHtmlPageFetcher
{
    /// <param name="url">Either absolute or relative to the source's base address.</param>
    Task<string> GetHtmlAsync(string url, CancellationToken cancellationToken = default);
}

public sealed class HttpClientPageFetcher(HttpClient httpClient) : IHtmlPageFetcher
{
    public Task<string> GetHtmlAsync(string url, CancellationToken cancellationToken = default) =>
        httpClient.GetStringAsync(url, cancellationToken);
}
