using System.Text.RegularExpressions;
using Dictionary.Api.Models;
using Dictionary.Api.Providers.Longman.Models;

namespace Dictionary.Api.Providers.Longman;

public sealed partial class LongmanDictionaryProvider(HttpClient httpClient) : IDictionaryProvider<LongmanDictionaryEntry>
{
    public string SourceName => LongmanHtmlParser.SourceName;

    public async Task<DictionaryLookupResult<LongmanDictionaryEntry>> LookupAsync(string word, CancellationToken cancellationToken = default)
    {
        var requestUri = $"dictionary/{Uri.EscapeDataString(NormalizeWord(word))}";

        try
        {
            var html = await httpClient.GetStringAsync(requestUri, cancellationToken);
            return LongmanHtmlParser.Parse(word, html);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new DictionaryLookupResult<LongmanDictionaryEntry>
            {
                Word = word,
                Source = SourceName,
                Error = ex.Message,
            };
        }
    }

    private static string NormalizeWord(string word)
    {
        var normalized = word.Trim().ToLowerInvariant();
        normalized = ApostropheRegex().Replace(normalized, "");
        normalized = WhitespaceRegex().Replace(normalized, " ");
        return normalized.Replace(' ', '-');
    }

    [GeneratedRegex("['’`]")]
    private static partial Regex ApostropheRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
