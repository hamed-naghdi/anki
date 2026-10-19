using System.Net;
using System.Text.Json;

namespace Dictionary.Api.Http.Cloudflare;

/// <summary>
/// The one place that owns a site's Cloudflare clearance - its cookies and the User-Agent they were
/// earned with - and the only place that asks the browser for a new one. A singleton, because
/// IHttpClientFactory recycles its handlers every couple of minutes and the cookies must outlive them.
/// </summary>
public sealed class CloudflareClearanceStore : IDisposable
{
    private const string ClearanceCookieName = "cf_clearance";

    /// <summary>Re-solve this long before the clearance cookie expires, so it never runs out mid-lookup.</summary>
    private static readonly TimeSpan RefreshMargin = TimeSpan.FromMinutes(2);

    /// <summary>After a failed solve (e.g. Cloudflare escalated to an interactive check), don't relaunch the browser for every lookup.</summary>
    private static readonly TimeSpan SolveCooldown = TimeSpan.FromMinutes(2);

    /// <summary>How long to stay on the browser-only path once a fresh clearance didn't get plain HTTP through.</summary>
    private static readonly TimeSpan BrowserOnlyPeriod = TimeSpan.FromMinutes(30);

    /// <summary>Upper bound on one solve, launch included - it isn't tied to any caller's cancellation, since others may be waiting on it.</summary>
    private static readonly TimeSpan SolveTimeout = TimeSpan.FromSeconds(60);

    private readonly Uri _siteAddress;
    private readonly ICloudflareBrowser _browser;
    private readonly string? _cachePath;
    private readonly ILogger<CloudflareClearanceStore> _logger;

    private readonly Lock _lock = new();
    private readonly CookieContainer _cookies = new();
    private string? _userAgent;
    private bool _expectsClearanceCookie;
    private int _generation;
    private Task<Session>? _solving;
    private DateTimeOffset _solveBlockedUntil = DateTimeOffset.MinValue;
    private Exception? _lastSolveError;
    private DateTimeOffset _browserOnlyUntil = DateTimeOffset.MinValue;

    public CloudflareClearanceStore(
        Uri siteAddress, ICloudflareBrowser browser, string? cachePath, ILogger<CloudflareClearanceStore> logger)
    {
        _siteAddress = siteAddress;
        _browser = browser;
        _cachePath = string.IsNullOrWhiteSpace(cachePath) ? null : cachePath;
        _logger = logger;
        Load();
    }

    /// <summary>The User-Agent to send, and which clearance it belongs to - so a caller that got challenged can say which one went stale.</summary>
    public readonly record struct Session(string UserAgent, int Generation);

    public bool UseBrowserOnly
    {
        get
        {
            lock (_lock)
            {
                return DateTimeOffset.UtcNow < _browserOnlyUntil;
            }
        }
    }

    public void SwitchToBrowserOnly()
    {
        lock (_lock)
        {
            _browserOnlyUntil = DateTimeOffset.UtcNow + BrowserOnlyPeriod;
        }
    }

    /// <summary>The <c>Cookie</c> header for the next request - read per request, so cookies refreshed by <see cref="Remember"/> are picked up.</summary>
    public string CookieHeader => _cookies.GetCookieHeader(_siteAddress);

    /// <summary>Keeps cookies the site rotates over plain HTTP (e.g. <c>__cf_bm</c>, the load balancer's) up to date.</summary>
    public void Remember(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var values))
        {
            return;
        }

        foreach (var value in values)
        {
            try
            {
                _cookies.SetCookies(_siteAddress, value);
            }
            catch (CookieException ex)
            {
                _logger.LogDebug(ex, "Ignoring a malformed Set-Cookie from {Host}", _siteAddress.Host);
            }
        }
    }

    /// <summary>The current clearance, solving first if there's none yet or it's about to expire.</summary>
    public Task<Session> GetSessionAsync(CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            // While in cooldown an about-to-expire clearance is still worth a try - it may have a minute left.
            if (_userAgent is not null && (IsFresh() || InCooldown()))
            {
                return Task.FromResult(new Session(_userAgent, _generation));
            }

            return StartOrJoinSolve(cancellationToken);
        }
    }

    /// <summary>
    /// A new clearance after <paramref name="staleGeneration"/> was challenged - unless another caller
    /// already replaced it in the meantime, in which case that newer one is returned without solving again.
    /// </summary>
    public Task<Session> RefreshAsync(int staleGeneration, CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            if (_userAgent is not null && _generation != staleGeneration)
            {
                return Task.FromResult(new Session(_userAgent, _generation));
            }

            return StartOrJoinSolve(cancellationToken);
        }
    }

    // Single-flight: every caller that needs a solve while one is running waits on that same one.
    private Task<Session> StartOrJoinSolve(CancellationToken cancellationToken)
    {
        if (_solving is null && InCooldown())
        {
            return Task.FromException<Session>(new HttpRequestException(
                $"{_lastSolveError?.Message} Not retrying before {_solveBlockedUntil.ToLocalTime():HH:mm:ss}.",
                _lastSolveError));
        }

        _solving ??= SolveAsync();
        return _solving.WaitAsync(cancellationToken);
    }

    private async Task<Session> SolveAsync()
    {
        // Leave the caller's lock before doing anything else.
        await Task.Yield();
        try
        {
            using var timeout = new CancellationTokenSource(SolveTimeout);
            var clearance = await _browser.SolveAsync(timeout.Token);

            Session session;
            lock (_lock)
            {
                foreach (var cookie in clearance.Cookies)
                {
                    _cookies.Add(cookie);
                }

                _userAgent = clearance.UserAgent;
                // No cf_clearance means the site didn't challenge at all - nothing to refresh ahead of time then.
                _expectsClearanceCookie = clearance.Cookies.Any(cookie => cookie.Name == ClearanceCookieName);
                _generation++;
                _solving = null;
                session = new Session(_userAgent, _generation);
                SaveLocked();
            }

            _logger.LogInformation("Got Cloudflare clearance for {Host}, valid until {Expires}", _siteAddress.Host, ClearanceExpiry()?.ToString() ?? "unknown");
            return session;
        }
        catch (Exception ex)
        {
            lock (_lock)
            {
                _solving = null;
                _solveBlockedUntil = DateTimeOffset.UtcNow + SolveCooldown;
                _lastSolveError = ex;
            }

            _logger.LogWarning(ex, "Couldn't get Cloudflare clearance for {Host}", _siteAddress.Host);
            if (ex is HttpRequestException)
            {
                throw;
            }

            throw new HttpRequestException($"Couldn't get past {_siteAddress.Host}'s Cloudflare challenge: {ex.Message}", ex);
        }
    }

    private bool InCooldown() => DateTimeOffset.UtcNow < _solveBlockedUntil;

    private bool IsFresh()
    {
        if (!_expectsClearanceCookie)
        {
            return true;
        }

        // CookieContainer drops expired cookies, so an expired clearance simply isn't found.
        var expiry = ClearanceExpiry();
        return expiry is not null && (expiry == DateTime.MaxValue || expiry > DateTime.Now + RefreshMargin);
    }

    /// <summary>Local time; <see cref="DateTime.MaxValue"/> for a session cookie; null when there's no clearance cookie.</summary>
    private DateTime? ClearanceExpiry()
    {
        var cookie = _cookies.GetCookies(_siteAddress).FirstOrDefault(c => c.Name == ClearanceCookieName && !c.Expired);
        return cookie is null ? null : cookie.Expires == DateTime.MinValue ? DateTime.MaxValue : cookie.Expires;
    }

    private sealed record CachedClearance(string UserAgent, bool ExpectsClearanceCookie, List<CachedCookie> Cookies);

    private sealed record CachedCookie(string Name, string Value, string Domain, string Path, DateTimeOffset? Expires);

    private void Load()
    {
        if (_cachePath is null || !File.Exists(_cachePath))
        {
            return;
        }

        try
        {
            var cached = JsonSerializer.Deserialize<CachedClearance>(File.ReadAllText(_cachePath));
            if (cached is null)
            {
                return;
            }

            foreach (var cookie in cached.Cookies.Where(c => c.Expires is null || c.Expires > DateTimeOffset.Now))
            {
                _cookies.Add(new Cookie(cookie.Name, cookie.Value, cookie.Path, cookie.Domain)
                {
                    Expires = cookie.Expires?.LocalDateTime ?? DateTime.MinValue,
                });
            }

            _userAgent = cached.UserAgent;
            _expectsClearanceCookie = cached.ExpectsClearanceCookie;
        }
        catch (Exception ex) when (ex is IOException or JsonException or CookieException or UnauthorizedAccessException)
        {
            // A broken cache only costs one extra solve.
            _logger.LogWarning(ex, "Ignoring unreadable Cloudflare clearance cache {Path}", _cachePath);
        }
    }

    private void SaveLocked()
    {
        if (_cachePath is null || _userAgent is null)
        {
            return;
        }

        try
        {
            var cookies = _cookies.GetAllCookies()
                .Where(c => !c.Expired)
                .Select(c => new CachedCookie(c.Name, c.Value, c.Domain, c.Path,
                    c.Expires == DateTime.MinValue ? null : new DateTimeOffset(c.Expires)))
                .ToList();
            var json = JsonSerializer.Serialize(new CachedClearance(_userAgent, _expectsClearanceCookie, cookies));

            Directory.CreateDirectory(Path.GetDirectoryName(_cachePath)!);
            var temporaryPath = _cachePath + ".tmp";
            File.WriteAllText(temporaryPath, json);
            File.Move(temporaryPath, _cachePath, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Couldn't save Cloudflare clearance cache {Path}", _cachePath);
        }
    }

    /// <summary>Saves the cookies rotated since the last solve, so a restart starts from the newest ones.</summary>
    public void Dispose()
    {
        lock (_lock)
        {
            SaveLocked();
        }
    }
}
