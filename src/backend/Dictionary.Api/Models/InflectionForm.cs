namespace Dictionary.Api.Models;

/// <summary>
/// One inflected form of a word - a plural, a comparative/superlative, a verb principal part, etc.
/// A word can carry any number of these independently (e.g. "swim" has past tense "swam", past
/// participle "swum", and present participle "swimming" as three separate entries). Pronunciation
/// is present only when the dictionary considers it non-obvious from spelling.
/// </summary>
public sealed class InflectionForm
{
    public string? Label { get; init; }
    public required string Form { get; init; }
    public Pronunciation? Pronunciation { get; init; }
}
