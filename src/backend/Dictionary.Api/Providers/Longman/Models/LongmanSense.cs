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

    IReadOnlyList<IExample> ISense.Examples => Examples;
}
