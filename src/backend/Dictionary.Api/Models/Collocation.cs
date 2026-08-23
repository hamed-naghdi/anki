namespace Dictionary.Api.Models;

/// <summary>One word/phrase that's commonly used together with the headword, e.g. "break" + "a promise".</summary>
public sealed class Collocation
{
    public required string Phrase { get; init; }

    /// <summary>A short parenthetical gloss on the phrase itself, e.g. "(=break your promise)" for "break your word".</summary>
    public string? Gloss { get; init; }
    public string? Example { get; init; }
}
