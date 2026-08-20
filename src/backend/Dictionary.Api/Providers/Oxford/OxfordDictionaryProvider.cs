using Dictionary.Api.Models;
using Dictionary.Api.Providers.Oxford.Models;

namespace Dictionary.Api.Providers.Oxford;

public sealed class OxfordDictionaryProvider(HttpClient httpClient) : IDictionaryProvider<OxfordDictionaryEntry>
{
    public string SourceName => OxfordHtmlParser.SourceName;

    public async Task<DictionaryLookupResult<OxfordDictionaryEntry>> LookupAsync(string word, CancellationToken cancellationToken = default)
    {
        // Oxford's own search redirect handles capitalization/spacing/apostrophes for us and,
        // unlike guessing a URL slug, degrades to a spellcheck page (still HTTP 200, just with
        // no #entryContent) instead of a 404 when the word isn't found.
        var requestUri = $"search/english/direct/?q={Uri.EscapeDataString(word)}";

        try
        {
            var html = await httpClient.GetStringAsync(requestUri, cancellationToken);
            return OxfordHtmlParser.Parse(word, html);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new DictionaryLookupResult<OxfordDictionaryEntry>
            {
                Word = word,
                Source = SourceName,
                Error = ex.Message,
            };
        }
    }
}
