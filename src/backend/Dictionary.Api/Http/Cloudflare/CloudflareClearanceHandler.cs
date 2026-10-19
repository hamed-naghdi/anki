using System.Text;

namespace Dictionary.Api.Http.Cloudflare;

/// <summary>
/// Lets plain HTTP through a site's Cloudflare challenge by sending the clearance a real browser earned:
/// its cookies plus its exact User-Agent (so this must run after anything else that sets one). A
/// challenge on the way means the clearance went stale (expired, or the IP changed) - it's renewed and
/// the request retried once. If even a fresh clearance is challenged, Cloudflare is checking more than
/// the cookie, so pages are loaded in the browser itself for a while - never worse than no clearance.
/// </summary>
public sealed class CloudflareClearanceHandler(
    CloudflareClearanceStore store,
    ICloudflareBrowser browser,
    ILogger<CloudflareClearanceHandler> logger) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (store.UseBrowserOnly)
        {
            return await SendWithBrowserAsync(request, cancellationToken);
        }

        var session = await store.GetSessionAsync(cancellationToken);
        var response = await SendWithClearanceAsync(request, session, cancellationToken);
        if (!IsChallenge(response))
        {
            return response;
        }

        response.Dispose();
        session = await store.RefreshAsync(session.Generation, cancellationToken);
        response = await SendWithClearanceAsync(request, session, cancellationToken);
        if (!IsChallenge(response))
        {
            return response;
        }

        response.Dispose();
        logger.LogWarning(
            "{Host} still challenges plain HTTP with a fresh clearance - loading its pages in the browser for now",
            request.RequestUri?.Host);
        store.SwitchToBrowserOnly();
        return await SendWithBrowserAsync(request, cancellationToken);
    }

    /// <summary>Only Cloudflare's challenge counts - a plain 403/404 is the site's real answer and is passed through as-is.</summary>
    public static bool IsChallenge(HttpResponseMessage response) =>
        response.Headers.TryGetValues("cf-mitigated", out var values) && values.Contains("challenge");

    private async Task<HttpResponseMessage> SendWithClearanceAsync(
        HttpRequestMessage request, CloudflareClearanceStore.Session session, CancellationToken cancellationToken)
    {
        request.Headers.Remove("User-Agent");
        request.Headers.TryAddWithoutValidation("User-Agent", session.UserAgent);

        // The primary handler has UseCookies off, so this header is the only source of cookies.
        request.Headers.Remove("Cookie");
        var cookieHeader = store.CookieHeader;
        if (cookieHeader.Length > 0)
        {
            request.Headers.TryAddWithoutValidation("Cookie", cookieHeader);
        }

        var response = await base.SendAsync(request, cancellationToken);
        store.Remember(response);
        return response;
    }

    private async Task<HttpResponseMessage> SendWithBrowserAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var html = await browser.GetHtmlAsync(request.RequestUri!, cancellationToken);
        return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(html, Encoding.UTF8, "text/html"),
            RequestMessage = request,
        };
    }
}
