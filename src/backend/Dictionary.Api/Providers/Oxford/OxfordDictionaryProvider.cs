using Dictionary.Api.Models;
using Dictionary.Api.Providers.Oxford.Models;

namespace Dictionary.Api.Providers.Oxford;

public sealed class OxfordDictionaryProvider(HttpClient httpClient) 
    : IDictionaryProvider<OxfordDictionaryEntry>
{
    /// <summary>Upper bound on extra homograph pages fetched per lookup - "tear" needs 3, but a runaway "Nearby words" match must never turn one lookup into a crawl.</summary>
    private const int MaxSiblingPages = 8;

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

            // This lookup only ever landed on ONE of the word's homographs (e.g. "tear¹" the verb) -
            // every other one ("tear¹" noun, "tear²" verb, "tear²" noun) lives on its own page, so
            // it has to be fetched and folded in too. Each page's "Nearby words" list only shows a
            // window around itself (see FindOtherHomographUrls), so every fetched page's list is
            // followed in turn until no new homograph turns up.
            var entries = new List<OxfordDictionaryEntry>(result.Entries);
            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (OxfordHtmlParser.FindOwnPageUrl(html) is { } ownUrl)
            {
                visited.Add(ownUrl);
            }

            var pending = new Queue<string>(OxfordHtmlParser.FindOtherHomographUrls(html).Where(visited.Add));
            var fetched = 0;
            while (pending.Count > 0 && fetched < MaxSiblingPages)
            {
                var siblingHtml = await FetchSiblingPageAsync(pending.Dequeue(), cancellationToken);
                fetched++;
                if (siblingHtml is null)
                {
                    continue;
                }

                entries.AddRange(OxfordHtmlParser.ParseEntries(siblingHtml));
                foreach (var url in OxfordHtmlParser.FindOtherHomographUrls(siblingHtml).Where(visited.Add))
                {
                    pending.Enqueue(url);
                }
            }

            // Discovery order depends on which homograph the search landed on; number order
            // (tear¹ before tear²) is how the dictionary itself lists them. OrderBy is stable, so
            // each homograph's own parts of speech keep the order they were found in.
            var ordered = entries.OrderBy(entry => int.TryParse(entry.HomographNumber, out var number) ? number : 0).ToList();

            return new DictionaryLookupResult<OxfordDictionaryEntry> { Word = word, Source = SourceName, Entries = ordered };
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
    private async Task<string?> FetchSiblingPageAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            return await httpClient.GetStringAsync(url, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return null;
        }
    }
}
