namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>One grouped column of a Longman THESAURUS box, e.g. "to break something" grouping "break", "smash", "snap", "split", ...</summary>
public sealed class ThesaurusSection
{
    public required string Heading { get; init; }
    public required IReadOnlyList<ThesaurusEntry> Entries { get; init; }
}
