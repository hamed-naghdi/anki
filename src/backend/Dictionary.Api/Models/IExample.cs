namespace Dictionary.Api.Models;

public interface IExample
{
    IReadOnlyList<TextSegment> Segments { get; }
    string? AudioUrl { get; }
    string? Note { get; }
}
