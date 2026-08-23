namespace Dictionary.Api.Models;

/// <summary>
/// One grammatical grouping within a collocations panel, e.g. "break + NOUN" (Longman) or
/// "adverb" (Oxford, meaning "adverbs that modify this headword").
/// </summary>
public sealed class CollocationSection
{
    public required string Heading { get; init; }
    public required IReadOnlyList<Collocation> Collocations { get; init; }
}
