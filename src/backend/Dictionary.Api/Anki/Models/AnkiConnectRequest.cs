using System.Text.Json.Serialization;

namespace Dictionary.Api.Anki.Models;

/// <summary>The request envelope every AnkiConnect action uses: https://foosoft.net/projects/anki-connect/#sample-invocation.</summary>
public sealed class AnkiConnectRequest<TParams>
{
    public required string Action { get; init; }
    public int Version { get; init; } = 6;

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TParams? Params { get; init; }
}
