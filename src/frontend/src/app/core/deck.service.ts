import { Injectable } from '@angular/core';
import { createPersistedListResource } from './persisted-list-resource';

/** Shape of GET /api/anki/decks - mirrors the backend's DeckListResult (Decks + nullable Error, never an exception). */
export interface DeckListResponse {
  decks: string[];
  error: string | null;
}

/** Decks live in Anki, not in this app - fetched through the backend (which talks to AnkiConnect). */
@Injectable({ providedIn: 'root' })
export class DeckService {
  private readonly resource = createPersistedListResource<DeckListResponse>(
    '/api/anki/decks',
    'anki.selectedDeck',
    (response) => response.decks,
  );

  readonly decks = this.resource.items;
  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly selectedDeck = this.resource.selected;

  selectDeck(deck: string): void {
    this.resource.select(deck);
  }

  reload(): void {
    this.resource.reload();
  }
}
