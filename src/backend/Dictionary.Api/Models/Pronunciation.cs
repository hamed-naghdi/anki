namespace Dictionary.Api.Models;

/// <summary>
/// One pronunciation of a word or one of its inflected forms. <see cref="Label"/> is null for the
/// base/primary pronunciation and set (e.g. "past tense and past participle") when a dictionary
/// gives a different pronunciation for an inflection, such as Longman's "read" (/ri:d/) vs. its
/// past tense "read" (/red/).
/// </summary>
public sealed class Pronunciation
{
    public string? Label { get; init; }
    public string? British { get; init; }
    public string? BritishAudioUrl { get; init; }
    public string? American { get; init; }
    public string? AmericanAudioUrl { get; init; }
}
