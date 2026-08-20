namespace Dictionary.Api.Models;

/// <summary>
/// One run of example text. Splitting text into segments (instead of one plain string) is what
/// lets an emphasized collocate (e.g. Longman's .COLLOINEXA, Oxford's .cl) survive normalization
/// without baking presentational HTML into the domain model.
/// </summary>
public sealed class TextSegment
{
    public required string Text { get; init; }
    public bool IsEmphasized { get; init; }
}
