namespace Dictionary.Api.Models;

/// <summary>One dictionary source's contribution to a multi-dictionary lookup.</summary>
public sealed class DictionarySourceResult
{
    public required string Source { get; init; }
    public IReadOnlyList<IDictionaryEntry> Entries { get; init; } = [];
    public string? Error { get; init; }
}
