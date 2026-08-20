namespace Dictionary.Api.Models;

/// <summary>
/// Minimal shape every dictionary provider's entry type has in common. Deliberately thin -
/// concepts that only one dictionary has (Longman's frequency badges, Oxford's CEFR/keyword
/// flags) belong on that provider's own concrete entry type, not here, so the shared contract
/// never forces a field that doesn't apply onto every provider's result.
/// </summary>
public interface IDictionaryEntry
{
    string? PartOfSpeech { get; }
    string? WordForms { get; }
    string? Grammar { get; }
    IReadOnlyList<Pronunciation> Pronunciations { get; }
    IReadOnlyList<ISense> Senses { get; }
}
