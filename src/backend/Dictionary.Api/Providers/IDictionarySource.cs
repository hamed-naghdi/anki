using Dictionary.Api.Models;

namespace Dictionary.Api.Providers;

/// <summary>
/// Non-generic adapter over a provider's <see cref="IDictionaryProvider{TEntry}"/> so the
/// multi-dictionary lookup endpoint can hold a mixed collection of providers (each with its own
/// concrete entry type) and query any subset of them uniformly. One adapter per provider - adding
/// a new dictionary means adding one adapter class, the aggregation endpoint itself never changes.
/// </summary>
public interface IDictionarySource
{
    /// <summary>Stable lowercase id used in the lookup endpoint's `sources` query parameter, e.g. "longman".</summary>
    string Key { get; }

    Task<DictionarySourceResult> LookupAsync(string word, CancellationToken cancellationToken = default);
}
