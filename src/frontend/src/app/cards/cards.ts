import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { Plus } from '@primeicons/angular/plus';
import { AnkiConnectService } from '../core/anki-connect.service';
import { LANGUAGES } from '../core/dictionary-api';
import { dictionaryModelName } from '../card-template/card-model';
import { decodeState } from '../card-template/card-state';

interface CardRow {
  noteId: number;
  word: string;
  deck: string;
  editable: boolean;
}

interface NoteInfo {
  noteId: number;
  fields: Record<string, { value: string }>;
  cards: number[];
}

/** Lists every dictionary note across the app's note types, newest first, each opening in the editor. */
@Component({
  selector: 'app-cards',
  imports: [RouterLink, ButtonDirective, Plus],
  templateUrl: './cards.html',
})
export class Cards {
  private readonly anki = inject(AnkiConnectService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<CardRow[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const models = LANGUAGES.map((language) => dictionaryModelName(language.key));
      const query = models.map((model) => `note:"${model}"`).join(' OR ');
      const noteIds = await this.anki.invoke<number[]>('findNotes', { query });
      if (!noteIds.length) {
        this.rows.set([]);
        return;
      }

      const notes = await this.anki.invoke<NoteInfo[]>('notesInfo', { notes: noteIds });
      const cardIds = notes.flatMap((note) => note.cards);
      const cardsInfo = await this.anki.invoke<Array<{ cardId: number; deckName: string }>>(
        'cardsInfo',
        { cards: cardIds },
      );
      const deckByCard = new Map(cardsInfo.map((card) => [card.cardId, card.deckName]));

      const rows = notes
        .map((note): CardRow => {
          const raw = note.fields['State']?.value ?? '';
          let word = '';
          try {
            word = raw.trim() ? decodeState(raw).word : '';
          } catch {
            word = '';
          }
          return {
            noteId: note.noteId,
            word: word || plainText(note.fields['Front']?.value ?? '').slice(0, 40) || '(untitled)',
            deck: deckByCard.get(note.cards[0] ?? -1) ?? '',
            editable: raw.trim().length > 0,
          };
        })
        .sort((a, b) => b.noteId - a.noteId);
      this.rows.set(rows);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
