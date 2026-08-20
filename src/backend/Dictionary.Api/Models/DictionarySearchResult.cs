namespace Dictionary.Api.Models;

public sealed class DictionarySearchResult
{
    public required string Word { get; init; }
    public required List<DictionarySourceResult> Results { get; init; }
}
