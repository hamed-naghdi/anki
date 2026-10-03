namespace Dictionary.Api.Models;

/// <summary>One word/phrase that's commonly used together with the headword, e.g. "break" + "a promise".</summary>
public sealed class Collocation
{
    public required string Phrase { get; init; }

    /// <summary>Where the main phrase is used, e.g. "British English" for "book an appointment". Null when it isn't regional.</summary>
    public string? Geo { get; init; }

    /// <summary>Alternative wordings, e.g. "schedule an appointment" (American English) for "book an appointment".</summary>
    public IReadOnlyList<PhraseVariant> Variants { get; init; } = [];

    /// <summary>A short parenthetical gloss on the phrase itself, e.g. "(=break your promise)" for "break your word".</summary>
    public string? Gloss { get; init; }

    /// <summary>Every example sentence for this collocation, in the dictionary's order - often one each for the main phrase and its variant.</summary>
    public IReadOnlyList<string> Examples { get; init; } = [];
}
