using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman;

public sealed class LongmanDictionarySource(IDictionaryProvider<Models.LongmanDictionaryEntry> provider) : IDictionarySource
{
    public const string SourceKey = "longman";

    public string Key => SourceKey;

    public async Task<DictionarySourceResult> LookupAsync(string word, CancellationToken cancellationToken = default)
    {
        var result = await provider.LookupAsync(word, cancellationToken);
        return new DictionarySourceResult { Source = result.Source, Entries = result.Entries, Error = result.Error };
    }
}
