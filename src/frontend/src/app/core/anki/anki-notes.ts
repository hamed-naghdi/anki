import { Injectable, inject } from '@angular/core';
import { AnkiConnect } from './anki-connect';
import { CardStylesheet } from '../../card/card-stylesheet';
import {
  CARD_TEMPLATES,
  CARD_TEMPLATE_MAP,
  MODEL_FIELDS,
  noteTypeName,
  parseStyleVersion,
} from '../../card/note-type';
import { CARD_STATE_VERSION, decodeState, type CardState } from '../../card/card-state';
import { LANGUAGES } from '../dictionary/dictionary-sources';

interface NoteInfo {
  noteId: number;
  fields: Record<string, { value: string; order: number } | undefined>;
  cards: number[];
}

interface CardInfo {
  cardId: number;
  deckName: string;
}

/** The rendered card plus everything needed to reopen it in the editor. */
export interface NoteContent {
  language: string;
  front: string;
  back: string;
  state: string;
  deckName: string;
}

/** A saved card, reopened for editing. */
export interface LoadedCard {
  state: CardState;
  cardIds: number[];
  deckName: string;
}

/** One row of the card list. */
export interface CardSummary {
  noteId: number;
  word: string;
  deck: string;
  /** False for cards with no saved editor state (added before editing existed, or edited in Anki). */
  editable: boolean;
}

/**
 * The app's dictionary notes in Anki, and the per-language note types (En-Dictionary, ...) they
 * use. A note type is created on first use, and its templates + styling are re-pushed whenever the
 * version compiled into the app is newer than the one stored in Anki.
 */
@Injectable({ providedIn: 'root' })
export class AnkiNotes {
  private readonly anki = inject(AnkiConnect);
  private readonly stylesheet = inject(CardStylesheet);

  async add(content: NoteContent): Promise<number> {
    const modelName = noteTypeName(content.language);
    await this.ensureNoteType(modelName);

    // Duplicate rejection is Anki's own: a note whose Front matches an existing note of this type
    // in the same deck is refused.
    return this.anki.invoke<number>('addNote', {
      note: {
        deckName: content.deckName,
        modelName,
        fields: { Front: content.front, Back: content.back, State: content.state },
        tags: ['personal-dictionary'],
        options: { allowDuplicate: false, duplicateScope: 'deck' },
      },
    });
  }

  /** Overwrites a note's fields, and moves its cards if the deck changed. */
  async update(noteId: number, cardIds: readonly number[], content: NoteContent): Promise<void> {
    await this.ensureNoteType(noteTypeName(content.language));
    await this.anki.invoke('updateNoteFields', {
      note: {
        id: noteId,
        fields: { Front: content.front, Back: content.back, State: content.state },
      },
    });
    if (content.deckName && cardIds.length) {
      await this.anki.invoke('changeDeck', { cards: cardIds, deck: content.deckName });
    }
  }

  /** Reads a note's saved editor state (plus its cards and deck) back for editing. */
  async load(noteId: number): Promise<LoadedCard> {
    const [note] = await this.anki.invoke<NoteInfo[]>('notesInfo', { notes: [noteId] });
    if (!note) {
      throw new Error(`Note ${noteId} was not found in Anki.`);
    }

    const raw = note.fields['State']?.value ?? '';
    if (!raw.trim()) {
      throw new Error(
        'This card has no saved editor data — it predates card editing, or was edited directly in Anki.',
      );
    }

    let state: CardState;
    try {
      state = decodeState(raw);
    } catch {
      throw new Error('This card’s saved editor data is unreadable.');
    }
    if (state.v !== CARD_STATE_VERSION) {
      throw new Error(
        `This card was saved by a different app version (data v${state.v}, this build expects v${CARD_STATE_VERSION}) — re-create it to edit.`,
      );
    }

    const cards = await this.anki.invoke<CardInfo[]>('cardsInfo', { cards: note.cards });
    return { state, cardIds: note.cards, deckName: cards[0]?.deckName ?? '' };
  }

  /** Every note of the app's note types, newest first. */
  async list(): Promise<CardSummary[]> {
    const query = LANGUAGES.map((language) => `note:"${noteTypeName(language.key)}"`).join(' OR ');
    const noteIds = await this.anki.invoke<number[]>('findNotes', { query });
    if (!noteIds.length) {
      return [];
    }

    const notes = await this.anki.invoke<NoteInfo[]>('notesInfo', { notes: noteIds });
    const cards = await this.anki.invoke<CardInfo[]>('cardsInfo', {
      cards: notes.flatMap((note) => note.cards),
    });
    const deckByCard = new Map(cards.map((card) => [card.cardId, card.deckName]));

    return notes
      .map((note): CardSummary => {
        const state = note.fields['State']?.value.trim() ?? '';
        const front = plainText(note.fields['Front']?.value ?? '').slice(0, 40);
        return {
          noteId: note.noteId,
          word: savedWord(state) || front || '(untitled)',
          deck: deckByCard.get(note.cards[0] ?? -1) ?? '',
          editable: state.length > 0,
        };
      })
      .sort((a, b) => b.noteId - a.noteId);
  }

  /** Opens Anki's card browser filtered to a note. */
  async showInBrowser(noteId: number): Promise<void> {
    await this.anki.invoke('guiBrowse', { query: `nid:${noteId}` });
  }

  /**
   * Pushes the compiled templates + card.css to a language's note type now, whatever the stored
   * version - so a styling tweak can be synced without adding or editing a card.
   */
  async pushStyling(language: string): Promise<void> {
    const modelName = noteTypeName(language);
    const css = await this.stylesheet.load();
    if (!(await this.ensureNoteTypeExists(modelName, css))) {
      await this.pushTemplatesAndStyling(modelName, css);
    }
  }

  private async ensureNoteType(modelName: string): Promise<void> {
    const css = await this.stylesheet.load();
    if (await this.ensureNoteTypeExists(modelName, css)) {
      return;
    }

    const { css: storedCss } = await this.anki.invoke<{ css: string }>('modelStyling', {
      modelName,
    });
    const stored = parseStyleVersion(storedCss);
    const shipped = parseStyleVersion(css);
    if (shipped !== null && (stored === null || stored < shipped)) {
      await this.pushTemplatesAndStyling(modelName, css);
    }
  }

  /**
   * Creates the note type if it's missing (returning true - it then already has the current
   * templates and styling), or backfills a field a note type from an older build lacks.
   */
  private async ensureNoteTypeExists(modelName: string, css: string): Promise<boolean> {
    const names = await this.anki.invoke<string[]>('modelNames');
    if (!names.includes(modelName)) {
      await this.anki.invoke('createModel', {
        modelName,
        inOrderFields: [...MODEL_FIELDS],
        css,
        isCloze: false,
        cardTemplates: CARD_TEMPLATES,
      });
      return true;
    }

    const fields = await this.anki.invoke<string[]>('modelFieldNames', { modelName });
    for (const [index, name] of MODEL_FIELDS.entries()) {
      if (!fields.includes(name)) {
        await this.anki.invoke('modelFieldAdd', { modelName, fieldName: name, index });
      }
    }
    return false;
  }

  private async pushTemplatesAndStyling(modelName: string, css: string): Promise<void> {
    await this.anki.invoke('updateModelTemplates', {
      model: { name: modelName, templates: CARD_TEMPLATE_MAP },
    });
    await this.anki.invoke('updateModelStyling', { model: { name: modelName, css } });
  }
}

function savedWord(rawState: string): string {
  try {
    return rawState ? decodeState(rawState).word : '';
  } catch {
    return '';
  }
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
