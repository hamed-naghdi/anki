using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>One near-synonym listed in a Longman THESAURUS box, with its own mini-definition - e.g. "smash" as an alternative to "break".</summary>
public sealed class ThesaurusEntry
{
    public required string Word { get; init; }

    /// <summary>Where this word is used, e.g. "British English". Null when it isn't regional.</summary>
    public string? Geo { get; init; }

    /// <summary>Alternative words with this same meaning, e.g. "bung" (also, British English) for "stick".</summary>
    public IReadOnlyList<PhraseVariant> Variants { get; init; } = [];
    public string? PartOfSpeech { get; init; }
    public string? Grammar { get; init; }
    public string? Definition { get; init; }
    public required IReadOnlyList<string> Examples { get; init; }
}
