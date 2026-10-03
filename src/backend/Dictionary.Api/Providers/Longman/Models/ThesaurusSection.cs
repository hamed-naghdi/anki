namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>One grouped column of a Longman THESAURUS box, e.g. "to break something" grouping "break", "smash", "snap", "split", ... Null heading when the box is a single unheaded section (the common case, e.g. "put").</summary>
public sealed class ThesaurusSection
{
    public string? Heading { get; init; }
    public required IReadOnlyList<ThesaurusEntry> Entries { get; init; }
}
