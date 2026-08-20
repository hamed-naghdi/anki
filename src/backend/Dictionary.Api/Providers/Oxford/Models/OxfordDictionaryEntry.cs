using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford.Models;

public sealed class OxfordDictionaryEntry : IDictionaryEntry
{
    public string? PartOfSpeech { get; init; }
    public string? Grammar { get; init; }
    public required IReadOnlyList<Pronunciation> Pronunciations { get; init; }
    public required IReadOnlyList<InflectionForm> InflectionForms { get; init; }

    /// <summary>Whether the headword is in the Oxford 3000/5000 keyword list.</summary>
    public bool IsKeyword { get; init; }

    /// <summary>CEFR level associated with the keyword-list membership above (e.g. "a1", "c1").</summary>
    public string? KeywordLevel { get; init; }

    /// <summary>OPAL (Oxford Phrasal Academic Lexicon) academic word-list badges, e.g. "OPAL S" (spoken, sublist 3).</summary>
    public required IReadOnlyList<UsageLabel> AcademicWordLists { get; init; }

    public required IReadOnlyList<OxfordSense> Senses { get; init; }

    IReadOnlyList<ISense> IDictionaryEntry.Senses => Senses;
}
