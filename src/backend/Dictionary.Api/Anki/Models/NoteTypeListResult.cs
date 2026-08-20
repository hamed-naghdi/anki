namespace Dictionary.Api.Anki.Models;

public sealed class NoteTypeListResult
{
    public IReadOnlyList<string> NoteTypes { get; init; } = [];
    public string? Error { get; init; }
}
