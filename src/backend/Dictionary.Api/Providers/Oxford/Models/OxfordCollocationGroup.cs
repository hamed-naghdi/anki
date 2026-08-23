using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford.Models;

/// <summary>
/// The "Oxford Collocations Dictionary" preview box attached to one sense - grouped by the
/// collocate's own grammatical role relative to the headword (e.g. "adverb", "preposition"),
/// unlike Longman's per-meaning grouping. The preview is deliberately truncated ("…") with a link
/// to the full entry on a separate Collocations Dictionary page, which isn't fetched here.
/// </summary>
public sealed class OxfordCollocationGroup
{
    public required IReadOnlyList<CollocationSection> Sections { get; init; }
    public bool IsTruncated { get; init; }
    public string? FullEntryUrl { get; init; }
}
