using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford;

public sealed class OxfordDictionarySource(IDictionaryProvider<Models.OxfordDictionaryEntry> provider) : IDictionarySource
{
    public const string SourceKey = "oxford";

    public string Key => SourceKey;

    public async Task<DictionarySourceResult> LookupAsync(string word, CancellationToken cancellationToken = default)
    {
        var result = await provider.LookupAsync(word, cancellationToken);
        return new DictionarySourceResult { Source = result.Source, Entries = result.Entries, Error = result.Error };
    }
}
