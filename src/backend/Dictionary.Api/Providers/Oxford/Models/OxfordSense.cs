using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford.Models;

public sealed class OxfordSense : ISense
{
    public string? Definition { get; init; }
    public string? Grammar { get; init; }
    public string? Register { get; init; }

    // Oxford's big "Synonyms" panel is a separate mini-thesaurus entry (multiple words, each with
    // its own usage note and examples), not a simple word list, so it isn't a fit for this field.
    // What's parsed here instead is the sense's own "opposite"/"synonym" cross-reference line
    // (a plain xrefs span, e.g. "opposite untrue") - a much shorter list, but a clean one, and the
    // closest Oxford equivalent of Longman's inline SYN/OPP tag.
    public IReadOnlyList<string> Synonyms { get; init; } = [];
    public IReadOnlyList<string> Antonyms { get; init; } = [];

    /// <summary>Grammar/collocational frames listed once for the whole sense, e.g. "curiosity (about something)".</summary>
    public required IReadOnlyList<string> Patterns { get; init; }

    /// <summary>This sense's own CEFR level (Oxford's cefr="c1" attribute), independent of the entry-level keyword level.</summary>
    public string? CefrLevel { get; init; }

    /// <summary>Whether this specific sense is flagged as an Oxford 3000/5000 keyword sense.</summary>
    public bool IsKeyword { get; init; }

    public required IReadOnlyList<OxfordExample> Examples { get; init; }

    /// <summary>Subject-area tags Oxford attaches to this specific sense, e.g. "Health and Fitness" at CEFR "a1" for one sense of "walk".</summary>
    public required IReadOnlyList<OxfordSenseTopic> Topics { get; init; }

    /// <summary>This sense's truncated "Oxford Collocations Dictionary" preview box, when it has one.</summary>
    public OxfordCollocationGroup? CollocationGroup { get; init; }

    /// <summary>
    /// A phrasal verb sense's own object-placement pattern (e.g. "look something ↔ up"), taken from
    /// the enclosing .pv-g's own .pv - a page like "look up" or "put on" carries several .pv-g
    /// groups under one URL, each with its own pattern and its own senses, so this is read per-sense
    /// rather than once for the whole entry the way <see cref="OxfordDictionaryEntry.Hyphenation"/>
    /// is. Null for a non-phrasal sense.
    /// </summary>
    public string? PhrasalVerbPattern { get; init; }

    IReadOnlyList<IExample> ISense.Examples => Examples;
}
