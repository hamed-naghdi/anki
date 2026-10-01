import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Client for the AnkiConnect HTTP API - a local add-on Anki exposes on localhost while running
 * (https://foosoft.net/projects/anki-connect/). The app talks to it directly; the backend has no
 * involvement in Anki integration.
 *
 * AnkiConnect always answers HTTP 200: success/failure is carried by which of `result`/`error` is
 * populated. A request that never reaches Anki (add-on missing, Anki not running, or this app's
 * origin not listed in the add-on's `webCorsOriginList` config) fails at the network level instead.
 * Both cases surface as an Error.
 */
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const ANKI_CONNECT_VERSION = 6;

const UNREACHABLE_MESSAGE =
  'Could not reach AnkiConnect. Make sure Anki is running and this app’s origin is allowed in the AnkiConnect add-on config.';

interface AnkiConnectResponse<T> {
  result: T | null;
  error: string | null;
}

export interface AnkiAction {
  action: string;
  params?: unknown;
}

function requestBody({ action, params }: AnkiAction) {
  return { action, version: ANKI_CONNECT_VERSION, params };
}

function unwrap<T>(response: AnkiConnectResponse<T>): T {
  if (response.error) {
    throw new Error(response.error);
  }
  return response.result as T;
}

/** Imperative calls - creating note types, adding/updating notes, opening Anki's browser. */
@Injectable({ providedIn: 'root' })
export class AnkiConnect {
  private readonly http = inject(HttpClient);

  async invoke<T>(action: string, params?: unknown): Promise<T> {
    let response: AnkiConnectResponse<T>;
    try {
      response = await firstValueFrom(
        this.http.post<AnkiConnectResponse<T>>(ANKI_CONNECT_URL, requestBody({ action, params })),
      );
    } catch {
      throw new Error(UNREACHABLE_MESSAGE);
    }
    return unwrap(response);
  }
}

/**
 * Reactive reads. `request` is tracked like any `httpResource` request function - return
 * `undefined` to stay idle. AnkiConnect's own `error` becomes the resource's error state, so
 * `value()` is always the unwrapped result. Must run in an injection context.
 */
export function ankiResource<T>(
  request: () => AnkiAction | undefined,
): HttpResourceRef<T | undefined> {
  return httpResource<T>(
    () => {
      const action = request();
      return action && { url: ANKI_CONNECT_URL, method: 'POST', body: requestBody(action) };
    },
    { parse: (raw) => unwrap(raw as AnkiConnectResponse<T>) },
  );
}

/** A resource error as user-facing text - transport failures get the "is Anki running?" hint. */
export function ankiErrorMessage(error: Error | undefined): string | null {
  if (!error) {
    return null;
  }
  return error.name === 'HttpErrorResponse' ? UNREACHABLE_MESSAGE : error.message;
}
