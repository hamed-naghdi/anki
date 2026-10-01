namespace Dictionary.Api.Models;

/// <summary>
/// A fixed idiomatic phrase built on the headword (e.g. "walk" -> "walk on air"), kept separate
/// from an entry's senses so an idiom's own meaning never gets counted as a literal sense of the
/// headword. Not every provider embeds the idiom's actual definition on this page - one may only
/// cross-reference it, another may embed it fully - so its senses (if any) live on that
/// provider's own idiom type.
/// </summary>
public interface IIdiom
{
    string Phrase { get; }
    string? CefrLevel { get; }
}
