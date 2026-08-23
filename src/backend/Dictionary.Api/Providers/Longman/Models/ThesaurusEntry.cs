namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>One near-synonym listed in a Longman THESAURUS box, with its own mini-definition - e.g. "smash" as an alternative to "break".</summary>
public sealed class ThesaurusEntry
{
    public required string Word { get; init; }
    public string? PartOfSpeech { get; init; }
    public string? Grammar { get; init; }
    public string? Definition { get; init; }
    public required IReadOnlyList<string> Examples { get; init; }
}
