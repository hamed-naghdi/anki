namespace Dictionary.Api.Providers.Oxford.Models;

/// <summary>One subject-area tag Oxford attaches to a sense, e.g. "Health and Fitness" at CEFR "a1" for one sense of "walk".</summary>
public sealed class OxfordSenseTopic
{
    public required string Name { get; init; }
    public string? CefrLevel { get; init; }
}
