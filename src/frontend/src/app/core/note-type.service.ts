import { Injectable } from '@angular/core';
import { createPersistedListResource } from './persisted-list-resource';

/** Shape of GET /api/anki/note-types - mirrors the backend's NoteTypeListResult. */
export interface NoteTypeListResponse {
  noteTypes: string[];
  error: string | null;
}

/** Note types (Anki "models") live in Anki, not in this app - fetched through the backend. */
@Injectable({ providedIn: 'root' })
export class NoteTypeService {
  private readonly resource = createPersistedListResource<NoteTypeListResponse>(
    '/api/anki/note-types',
    'anki.selectedNoteType',
    (response) => response.noteTypes,
  );

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
