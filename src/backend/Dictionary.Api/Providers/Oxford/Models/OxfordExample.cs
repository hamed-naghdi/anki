using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Oxford.Models;

public sealed class OxfordExample : IExample
{
    public required IReadOnlyList<TextSegment> Segments { get; init; }
    public string? AudioUrl { get; init; }
    public string? Note { get; init; }

    /// <summary>
    /// A grammar pattern tied to just this example, e.g. "be true (that)…" for
    /// "Is it true she's leaving?". Oxford sometimes attaches a .cf pattern to one specific
    /// example rather than the whole sense - when it does, it lives here instead of on
    /// <see cref="OxfordSense.Patterns"/>.
    /// </summary>
    public string? Pattern { get; init; }
}
