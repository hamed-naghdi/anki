using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

/// <summary>
/// Longman only cross-references an idiom built on the headword (e.g. "break" -> "break a leg")
/// with a link to that idiom's own dictionary page - it doesn't embed the idiom's definition here,
/// so <see cref="Senses"/> is always empty. <see cref="Url"/> is the page a caller would need to
/// fetch separately to get the actual definition.
/// </summary>
public sealed class LongmanIdiom : IIdiom
{
    public required string Phrase { get; init; }
    public string? Url { get; init; }

    string? IIdiom.CefrLevel => null;
    IReadOnlyList<ISense> IIdiom.Senses => [];
}
