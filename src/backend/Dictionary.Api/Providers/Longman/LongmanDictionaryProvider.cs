using Dictionary.Api.Models;
using Dictionary.Api.Providers.Longman.Models;

namespace Dictionary.Api.Providers.Longman;

public sealed class LongmanDictionaryProvider(HttpClient httpClient)
    : IDictionaryProvider<LongmanDictionaryEntry>
{
    public string SourceName => LongmanHtmlParser.SourceName;

    public async Task<DictionaryLookupResult<LongmanDictionaryEntry>> LookupAsync(string word, CancellationToken cancellationToken = default)
    {
        // Longman's own search redirect resolves a phrase to whatever entry it lives under (e.g.
        // "here you are" -> /dictionary/english/here-you-are-here-you-go), which guessing a URL slug
        // from the phrase can't. Unknown words land on a spellcheck page with no entries.
        var requestUri = $"search/english/direct/?q={Uri.EscapeDataString(word.Trim())}";

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
}
