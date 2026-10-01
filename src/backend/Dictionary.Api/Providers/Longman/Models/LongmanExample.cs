using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanExample : IExample
{
    public required IReadOnlyList<TextSegment> Segments { get; init; }
    public string? AudioUrl { get; init; }
}
