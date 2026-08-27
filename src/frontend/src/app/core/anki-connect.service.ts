import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ANKI_CONNECT_URL, AnkiConnectResponse } from './anki-connect';

const ANKI_CONNECT_VERSION = 6;

/**
 * Imperative AnkiConnect client for one-off actions (create a note type, add a note, open the
 * browser) - as opposed to the reactive `httpResource` path in persisted-list-resource.
 *
 * AnkiConnect always answers HTTP 200 with `{ result, error }`; a populated `error` is a real
 * failure, and a request that never reaches Anki (add-on missing, Anki not running, this origin not
 * in `webCorsOriginList`) fails at the fetch level. Both surface here as a thrown Error.
 */
@Injectable({ providedIn: 'root' })
export class AnkiConnectService {
  private readonly http = inject(HttpClient);

  async invoke<TResult>(action: string, params?: unknown): Promise<TResult> {
    let response: AnkiConnectResponse<TResult>;
    try {
      response = await firstValueFrom(
        this.http.post<AnkiConnectResponse<TResult>>(ANKI_CONNECT_URL, {
          action,
          version: ANKI_CONNECT_VERSION,
          params,
        }),
      );
    } catch {
      throw new Error(
        'Could not reach AnkiConnect. Make sure Anki is running and this app’s origin is allowed in the AnkiConnect add-on config.',
      );
    }

    if (response.error) {
      throw new Error(response.error);
    }
    return response.result as TResult;
  }
}
