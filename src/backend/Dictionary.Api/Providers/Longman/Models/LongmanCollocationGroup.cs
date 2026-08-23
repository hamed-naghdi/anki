using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>
/// One "COLLOCATIONS" box, tied to one sense by a free-text heading Longman prints itself (e.g.
/// "Meaning 5: to not do something..."). That heading is a paraphrase, not verbatim identical to
/// any <see cref="LongmanSense.Definition"/>, so it's kept as a hint for display rather than
/// matched back to a specific sense programmatically.
/// </summary>
public sealed class LongmanCollocationGroup
{
    public string? MeaningHint { get; init; }
    public required IReadOnlyList<CollocationSection> Sections { get; init; }
}
