using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public sealed class LongmanCollectionExample : IExample
{
    public required string Collection { get; init; }
    public string? Glossary { get; init; }
    public IReadOnlyList<LongmanExample> Examples { get; init; } = [];
}