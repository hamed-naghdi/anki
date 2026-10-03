namespace Dictionary.Api.Models;

/// <summary>
/// An alternative wording of a phrase, e.g. "schedule an appointment" (American English) for
/// "book an appointment" (British English), or "an appointment at the doctor's" (also) for
/// "a doctor's appointment".
/// </summary>
public sealed class PhraseVariant
{
    public required string Phrase { get; init; }

    /// <summary>Where this wording is used, e.g. "British English"/"American English". Null when it isn't regional.</summary>
    public string? Geo { get; init; }

    /// <summary>The word linking it to the main phrase, e.g. "also". Null when the dictionary prints none.</summary>
    public string? LinkWord { get; init; }
}
