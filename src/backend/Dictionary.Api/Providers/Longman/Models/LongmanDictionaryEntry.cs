using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanDictionaryEntry : IDictionaryEntry
{
    public string? PartOfSpeech { get; init; }
    public string? Hyphenation { get; init; }
    public string? WordForms { get; init; }
    public string? Grammar { get; init; }
    public required IReadOnlyList<Pronunciation> Pronunciations { get; init; }

    /// <summary>Longman's frequency dots ("●●○") and top-1000 spoken/written ("S1"/"W1") badges.</summary>
    public required IReadOnlyList<UsageLabel> FrequencyLabels { get; init; }

    public required IReadOnlyList<LongmanSense> Senses { get; init; }

    IReadOnlyList<ISense> IDictionaryEntry.Senses => Senses;
}
