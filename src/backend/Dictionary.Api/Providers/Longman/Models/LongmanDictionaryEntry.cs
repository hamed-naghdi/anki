using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanDictionaryEntry : IDictionaryEntry
{
    public string? PartOfSpeech { get; init; }

    /// <summary>Longman's superscript homograph number (e.g. the "1" in "free¹"), distinguishing this entry from other same-spelled headwords on the page. Null when the page doesn't print one.</summary>
    public string? HomographNumber { get; init; }

    public string? Hyphenation { get; init; }
    public string? Grammar { get; init; }
    public required IReadOnlyList<Pronunciation> Pronunciations { get; init; }
    public required IReadOnlyList<InflectionForm> InflectionForms { get; init; }

    /// <summary>Longman's frequency dots ("●●○") and top-1000 spoken/written ("S1"/"W1") badges.</summary>
    public required IReadOnlyList<UsageLabel> FrequencyLabels { get; init; }

    public required IReadOnlyList<LongmanSense> Senses { get; init; }

    /// <summary>Word origin/history, e.g. "Old English: brecan". Null when Longman doesn't print one for this homograph.</summary>
    public string? Etymology { get; init; }

    /// <summary>Idioms cross-referenced from this entry - Longman only links to their own page, so these carry no embedded definition (see <see cref="LongmanIdiom"/>).</summary>
    public required IReadOnlyList<LongmanIdiom> Idioms { get; init; }

    /// <summary>The page's "Word family" box - shared across every homograph on this page, not specific to this entry's own part of speech.</summary>
    public required IReadOnlyList<WordFamilyMember> WordFamily { get; init; }

    public required IReadOnlyList<LongmanCollocationGroup> CollocationGroups { get; init; }
    public required IReadOnlyList<ThesaurusSection> ThesaurusSections { get; init; }

    IReadOnlyList<ISense> IDictionaryEntry.Senses => Senses;
    IReadOnlyList<IIdiom> IDictionaryEntry.Idioms => Idioms;
}
