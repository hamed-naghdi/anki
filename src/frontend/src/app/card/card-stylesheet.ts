import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * The compiled card stylesheet, as text to push into Anki's note type. card.css is emitted by the
 * build as the non-injected `pd-card.css` bundle (see angular.json `styles`), fetched once here.
 */
@Injectable({ providedIn: 'root' })
export class CardStylesheet {
  private readonly baseUri = inject(DOCUMENT).baseURI;
  private pending: Promise<string> | null = null;

  load(): Promise<string> {
    this.pending ??= fetch(new URL('pd-card.css', this.baseUri))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`card stylesheet (pd-card.css) not found — ${response.status}`);
        }
        return response.text();
      })
      .catch((error: unknown) => {
        this.pending = null; // allow a later retry
        throw error instanceof Error ? error : new Error(String(error));
      });
    return this.pending;
  }
}
