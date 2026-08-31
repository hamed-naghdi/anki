import { Injectable } from '@angular/core';

/**
 * Loads the compiled card stylesheet. `card.css` (hand-authored rules for the `pd-*` classes
 * render-card.ts emits, plus the resolved PrimeNG theme tokens the colors are pinned to) is emitted
 * by the Angular build as a non-injected `pd-card.css` bundle (see angular.json `styles`); this
 * fetches it once and hands the text to AnkiModelService to push into the note type. It is never
 * applied to the app itself - the in-app preview renders from the Angular templates.
 */
@Injectable({ providedIn: 'root' })
export class CardStylesheet {
  private pending: Promise<string> | null = null;

  load(): Promise<string> {
    if (!this.pending) {
      const url = new URL('pd-card.css', document.baseURI);
      this.pending = fetch(url)
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
    }
    return this.pending;
  }
}
