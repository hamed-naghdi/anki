namespace Dictionary.Api.Models;

/// <summary>
/// Minimal shape every dictionary provider's sense type has in common. Grammar patterns
/// (e.g. "curiosity about") are intentionally NOT here: how a dictionary attaches a pattern to
/// its examples differs per source (Longman ties one pattern to one specific example group;
/// Oxford lists patterns once for the whole sense), so each provider's own sense/example type
/// models that link the way its source actually structures it.
/// </summary>
public interface ISense
{
    string? Definition { get; }
    string? Grammar { get; }
    string? Register { get; }
    IReadOnlyList<string> Synonyms { get; }
    IReadOnlyList<string> Antonyms { get; }
    IReadOnlyList<IExample> Examples { get; }
}
