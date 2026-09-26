using Dictionary.Api.Models;

namespace Dictionary.Api.Providers.Longman.Models;

public class LongmanCollectionExample : IExample
{
    public string SourceType => nameof(LongmanCollectionExample);
    
    public required string Collection { get; init; }
    public string? Glossary { get; init; }
    public IReadOnlyList<LongmanExample> Examples { get; init; } = [];
}