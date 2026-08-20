namespace Dictionary.Api.Models;

/// <summary>
/// A short vocabulary badge with a human-readable explanation, e.g. Longman's frequency dots
/// ("●●○" / "Core vocabulary: Medium-frequency") or S1/W1 top-1000-word markers.
/// Deliberately minimal - dictionaries that attach richer semantics to their badges (Oxford's
/// CEFR level + keyword-list flag) model that on their own entry/sense type instead of here.
/// </summary>
public sealed class UsageLabel
{
    public required string Code { get; init; }
    public string? Description { get; init; }
}
