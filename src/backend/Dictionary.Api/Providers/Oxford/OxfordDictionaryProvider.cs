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
            var result = OxfordHtmlParser.Parse(word, html);
            if (result.Error is not null)
            {
                return result;
            }

            // This lookup only ever landed on ONE of the word's homographs (e.g. "walk" the verb) -
            // every other one (e.g. "walk" the noun) lives on its own separate page, so it has to
            // be fetched and folded in too. See FindOtherHomographUrls for how those pages are found.
            var siblingUrls = OxfordHtmlParser.FindOtherHomographUrls(html);
            if (siblingUrls.Count == 0)
            {
                return result;
            }

            var entries = new List<OxfordDictionaryEntry>(result.Entries);
            foreach (var siblingUrl in siblingUrls)
            {
                entries.AddRange(await FetchSiblingEntriesAsync(siblingUrl, cancellationToken));
            }

            return new DictionaryLookupResult<OxfordDictionaryEntry> { Word = word, Source = SourceName, Entries = entries };
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

    /// <summary>
    /// A sibling homograph page failing to load (network hiccup, page since removed, ...) shouldn't
    /// fail the whole lookup - the primary entry this search already landed on is still worth
    /// returning, just without that one extra part of speech.
    /// </summary>
    private async Task<List<OxfordDictionaryEntry>> FetchSiblingEntriesAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            var html = await httpClient.GetStringAsync(url, cancellationToken);
            return OxfordHtmlParser.ParseEntries(html);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return [];
        }
    }
}
