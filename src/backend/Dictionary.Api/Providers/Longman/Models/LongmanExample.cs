using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanExample : IExample
{
    public required IReadOnlyList<TextSegment> Segments { get; init; }
    public string? AudioUrl { get; init; }
    public string? Note { get; init; }

    /// <summary>
    /// The grammar pattern this specific example illustrates, e.g. "curiosity about" for
    /// "Children have a natural curiosity about the world around them." Longman ties a pattern
    /// (GramExa/PROPFORM*) to one group of examples, not to the whole sense, so it lives here.
    /// </summary>
    public string? Pattern { get; init; }
}
