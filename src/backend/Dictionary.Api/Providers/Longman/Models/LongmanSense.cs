using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanSense : ISense
{
    public string? Definition { get; init; }
    public string? Grammar { get; init; }
    public string? Register { get; init; }
    public required IReadOnlyList<string> Synonyms { get; init; }
    public required IReadOnlyList<string> Antonyms { get; init; }
    public required IReadOnlyList<LongmanExample> Examples { get; init; }

    /// <summary>Longman's own sense number/letter, e.g. "1", "1a", "1b" - present so lettered sub-senses that share one guideword stay traceable to their parent number.</summary>
    public string? SenseLabel { get; init; }

    /// <summary>The bold all-caps guide word grouping a set of sub-senses, e.g. "IN PIECES" for "break" sense 1. Null when this sense has no sub-senses of its own.</summary>
    public string? Guideword { get; init; }

    /// <summary>The short italic gloss right after a guideword, e.g. "separate into pieces".</summary>
    public string? Signpost { get; init; }

    /// <summary>Longman's raw subject-field code, e.g. "DST" for the tennis sense of "break" - printed as an icon on the site, no text expansion is available from the HTML alone.</summary>
    public string? Field { get; init; }

    /// <summary>Illustration Longman prints at the top of this sense (e.g. "frying pan", "corkscrew") - null for the vast majority of senses, which have none.</summary>
    public string? ImageUrl { get; init; }

    IReadOnlyList<IExample> ISense.Examples => Examples;
}
