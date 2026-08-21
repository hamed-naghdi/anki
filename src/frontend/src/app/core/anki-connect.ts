/**
 * Direct client for the AnkiConnect HTTP API - a local add-on Anki exposes on localhost while
 * running (see https://foosoft.net/projects/anki-connect/). The Angular app talks to it directly;
 * the backend has no involvement in Anki integration.
 *
 * AnkiConnect always answers HTTP 200, even on failure - success/failure is carried by which of
 * `result`/`error` is populated, never by the status code. A request that never reaches Anki
 * (add-on not installed, Anki not running) instead fails at the network/fetch level.
 *
 * Note: AnkiConnect only accepts requests from origins listed in its `webCorsOriginList` config
 * (Anki > Tools > Add-ons > AnkiConnect > Config). Add this app's origin (e.g.
 * "http://localhost:4200") there, or requests will be rejected even though Anki is running.
 */
export const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';

const ANKI_CONNECT_VERSION = 6;

export interface AnkiConnectResponse<TResult> {
  result: TResult | null;
  error: string | null;
}

/** Builds an httpResource-compatible request for a given AnkiConnect action. */
export function ankiConnectRequest<TParams = undefined>(action: string, params?: TParams) {
  return {
    url: ANKI_CONNECT_URL,
    method: 'POST' as const,
    body: { action, version: ANKI_CONNECT_VERSION, params },
  };
}
