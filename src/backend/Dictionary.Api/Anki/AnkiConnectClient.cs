using System.Text;
using System.Text.Json;
using Dictionary.Api.Anki.Models;

namespace Dictionary.Api.Anki;

/// <summary>
/// Thin wrapper over the AnkiConnect HTTP API (a local add-on Anki exposes on localhost while
/// running - see https://foosoft.net/projects/anki-connect/). <see cref="InvokeAsync{TParams,TResult}"/>
/// carries the request/response envelope and error handling generically so adding the next action
/// (note creation, model names, ...) is one method, not a new protocol implementation.
/// </summary>
public sealed class AnkiConnectClient(HttpClient httpClient)
{
    // AnkiConnect's own JSON parsing is case-sensitive and requires lowercase keys ("action",
    // "version", "params", "result", "error") - it rejects "Action" outright.
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<DeckListResult> GetDeckNamesAsync(CancellationToken cancellationToken = default)
    {
        var (decks, error) = await InvokeAsync<object?, List<string>>("deckNames", null, cancellationToken);
        return new DeckListResult { Decks = decks ?? [], Error = error };
    }

    public async Task<NoteTypeListResult> GetNoteTypeNamesAsync(CancellationToken cancellationToken = default)
    {
        var (noteTypes, error) = await InvokeAsync<object?, List<string>>("modelNames", null, cancellationToken);
        return new NoteTypeListResult { NoteTypes = noteTypes ?? [], Error = error };
    }

    private async Task<(TResult? Result, string? Error)> InvokeAsync<TParams, TResult>(
        string action, TParams? parameters, CancellationToken cancellationToken)
    {
        try
        {
            var request = new AnkiConnectRequest<TParams> { Action = action, Params = parameters };
            var requestJson = JsonSerializer.Serialize(request, JsonOptions);

            // AnkiConnect's HTTP server only reads a Content-Length body, not chunked transfer
            // encoding. System.Net.Http.Json's PostAsJsonAsync streams the body directly to the
            // request, which HttpClient sends as chunked since it doesn't know the length upfront -
            // AnkiConnect then silently ignores the (unreadable) body and answers with its version
            // handshake instead of the actual action result, with no error to indicate why.
            // Serializing to a string first gives StringContent a known length, forcing
            // Content-Length instead of chunked.
            using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
            using var httpResponse = await httpClient.PostAsync(string.Empty, content, cancellationToken);
            httpResponse.EnsureSuccessStatusCode();

            var responseJson = await httpResponse.Content.ReadAsStringAsync(cancellationToken);
            var response = JsonSerializer.Deserialize<AnkiConnectResponse<TResult>>(responseJson, JsonOptions);
            if (response is null)
            {
                return (default, "AnkiConnect returned an empty response.");
            }

            return response.Error is not null ? (default, response.Error) : (response.Result, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return (default, "Anki isn't running, or the AnkiConnect add-on isn't reachable.");
        }
    }
}
