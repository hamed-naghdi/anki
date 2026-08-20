using Dictionary.Api.Models;

namespace Dictionary.Api.Providers;

public interface IDictionaryProvider<TEntry>
    where TEntry : IDictionaryEntry
{
    string SourceName { get; }

    Task<DictionaryLookupResult<TEntry>> LookupAsync(string word, CancellationToken cancellationToken = default);
}
