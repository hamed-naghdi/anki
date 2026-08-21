import { Injectable } from '@angular/core';
import { createPersistedListResource } from './persisted-list-resource';

/** Note types ("models") live in Anki - fetched directly from AnkiConnect (action "modelNames"). */
@Injectable({ providedIn: 'root' })
export class NoteTypeService {
  private readonly resource = createPersistedListResource('modelNames', 'anki.selectedNoteType');

  readonly noteTypes = this.resource.items;
  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly selectedNoteType = this.resource.selected;

  selectNoteType(noteType: string): void {
    this.resource.select(noteType);
  }

  reload(): void {
    this.resource.reload();
  }
}
