namespace Dictionary.Api.Anki.Models;

/// <summary>Mirrors the DictionaryLookupResult convention already used elsewhere: a plain value plus a nullable Error, no exceptions crossing the API boundary.</summary>
public sealed class DeckListResult
{
    public IReadOnlyList<string> Decks { get; init; } = [];
    public string? Error { get; init; }
}
