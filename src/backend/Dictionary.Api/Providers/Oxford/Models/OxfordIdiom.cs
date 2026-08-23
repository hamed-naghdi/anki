using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford.Models;

/// <summary>
/// Oxford embeds an idiom's own definition directly in its "Idioms" section (unlike Longman, which
/// only cross-references the idiom's separate page), so <see cref="Senses"/> here is real content,
/// not empty.
/// </summary>
public sealed class OxfordIdiom : IIdiom
{
    public required string Phrase { get; init; }
    public string? CefrLevel { get; init; }
    public required IReadOnlyList<OxfordSense> Senses { get; init; }

    IReadOnlyList<ISense> IIdiom.Senses => Senses;
}
