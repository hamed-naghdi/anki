namespace Dictionary.Api.Models;

/// <summary>
/// One pronunciation of a word or one of its inflected forms. <see cref="Label"/> is null for the
/// base/primary pronunciation and set (e.g. "past tense") when a dictionary gives a different
/// pronunciation for an inflection. British and American are independent lists - not a single
/// paired field - because either can carry more than one accepted variant.
/// </summary>
public sealed class Pronunciation
{
    public string? Label { get; init; }
    public IReadOnlyList<PhoneticVariant> British { get; init; } = [];
    public IReadOnlyList<PhoneticVariant> American { get; init; } = [];
}
