namespace Dictionary.Api.Models;

public sealed class DictionaryLookupResult<TEntry>
    where TEntry : IDictionaryEntry
{
    public required string Word { get; init; }
    public required string Source { get; init; }
    public List<TEntry> Entries { get; init; } = [];
    public string? Error { get; init; }
}
