using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanGrammarExample : IExample
{
    /// <summary>
    /// The grammar pattern this specific example illustrates, e.g. "curiosity about" for
    /// "Children have a natural curiosity about the world around them." Longman ties a pattern
    /// (GramExa/PROPFORM*) to one group of examples, not to the whole sense, so it lives here.
    /// </summary>
    public required string Pattern { get; init; }
    
    public IReadOnlyList<LongmanExample> Examples { get; init; } = [];
}