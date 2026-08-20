namespace Dictionary.Api.Anki.Models;

/// <summary>
/// AnkiConnect always answers HTTP 200, even on failure - success/failure is carried by which of
/// these two fields is populated, never by the status code.
/// </summary>
public sealed class AnkiConnectResponse<TResult>
{
    public TResult? Result { get; init; }
    public string? Error { get; init; }
}
