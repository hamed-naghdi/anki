import { Injectable, inject } from '@angular/core';
import { AnkiConnectService } from './anki-connect.service';
import { CardStylesheet } from '../card-template/card-stylesheet.service';
import {
  CARD_TEMPLATES,
  CARD_TEMPLATE_MAP,
  MODEL_FIELDS,
  dictionaryModelName,
  parseStyleVersion,
} from '../card-template/card-model';
import { CARD_STATE_VERSION, CardState, decodeState } from '../card-template/card-state';

interface AnkiNoteInfo {
  noteId: number;
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
}

/** Everything card-new needs to reopen an existing note for editing. */
export interface LoadedCard {
  state: CardState;
  cardIds: number[];
  deckName: string;
}

/**
 * Owns the per-language dictionary note types in Anki (En-Dictionary, ...). Creates a note type on
 * first use and re-pushes its styling + card templates whenever the version compiled into the app
 * is newer than the one stored in Anki (addNote/updateNote), or unconditionally on demand
 * (pushStyling, for the "Update Anki styling" button); also backfills the hidden `State` field on
 * note types made by an older build. Never touches a note's field content except through
 * addNote / updateNote here.
 */
@Injectable({ providedIn: 'root' })
export class AnkiModelService {
  private readonly anki = inject(AnkiConnectService);
  private readonly stylesheet = inject(CardStylesheet);

  async addNote(
    languageKey: string,
    frontHtml: string,
    backHtml: string,
    deckName: string,
    state: string,
  ): Promise<number> {
    const modelName = dictionaryModelName(languageKey);
    const css = await this.stylesheet.load();
    await this.ensureModel(modelName, css);

    // Duplicate rejection is Anki's own: `allowDuplicate: false` blocks a note whose Front matches
    // an existing note of this type in the same deck.
    return this.anki.invoke<number>('addNote', {
      note: {
        deckName,
        modelName,
        fields: { Front: frontHtml, Back: backHtml, State: state },
        tags: ['personal-dictionary'],
        options: { allowDuplicate: false, duplicateScope: 'deck' },
      },
    });
  }

  /** Read back a note's editor state (+ its cards and deck) so card-new can rehydrate. */
  async loadCard(noteId: number): Promise<LoadedCard> {
    const notes = await this.anki.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [noteId] });
    const note = notes[0];
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

    const cards = await this.anki.invoke<Array<{ deckName: string }>>('cardsInfo', {
      cards: note.cards,
    });
    return { state, cardIds: note.cards, deckName: cards[0]?.deckName ?? '' };
  }

  /** Save an edited card back: overwrite its fields, and move its cards if the deck changed. */
  async updateNote(
    languageKey: string,
    noteId: number,
    cardIds: number[],
    frontHtml: string,
    backHtml: string,
    state: string,
    deckName: string,
  ): Promise<void> {
    const css = await this.stylesheet.load();
    await this.ensureModel(dictionaryModelName(languageKey), css);

    await this.anki.invoke('updateNoteFields', {
      note: { id: noteId, fields: { Front: frontHtml, Back: backHtml, State: state } },
    });
    if (deckName && cardIds.length) {
      await this.anki.invoke('changeDeck', { cards: cardIds, deck: deckName });
    }
  }

  /** Open Anki's card browser filtered to a note. */
  async showInBrowser(noteId: number): Promise<void> {
    await this.anki.invoke('guiBrowse', { query: `nid:${noteId}` });
  }

  /**
   * Force-push the compiled templates + card.css to a language's note type right now, regardless
   * of `--pd-style-version` - for the "Update Anki styling" button, so a styling tweak can be
   * synced without adding or editing a card just to trigger ensureModel's version-gated push.
   */
  async pushStyling(languageKey: string): Promise<void> {
    const modelName = dictionaryModelName(languageKey);
    const css = await this.stylesheet.load();
    const created = await this.ensureModelExists(modelName, css);
    if (created) {
      return; // createModel already applied the current templates + css.
    }

    await this.anki.invoke('updateModelTemplates', {
      model: { name: modelName, templates: CARD_TEMPLATE_MAP },
    });
    await this.anki.invoke('updateModelStyling', {
      model: { name: modelName, css },
    });
  }

  private async ensureModel(modelName: string, css: string): Promise<void> {
    const created = await this.ensureModelExists(modelName, css);
    if (created) {
      return;
    }

    const stored = parseStyleVersion(
      (await this.anki.invoke<{ css: string }>('modelStyling', { modelName })).css,
    );
    const shipped = parseStyleVersion(css);
    if (shipped !== null && (stored === null || stored < shipped)) {
      await this.anki.invoke('updateModelTemplates', {
        model: { name: modelName, templates: CARD_TEMPLATE_MAP },
      });
      await this.anki.invoke('updateModelStyling', {
        model: { name: modelName, css },
      });
    }
  }

  /** Creates the note type if missing, or backfills a hidden field an older build lacks. Returns
   *  whether it just created the model (in which case templates/css are already current). */
  private async ensureModelExists(modelName: string, css: string): Promise<boolean> {
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

    // A note type from an older build may be missing the hidden `State` field.
    const fields = await this.anki.invoke<string[]>('modelFieldNames', { modelName });
    for (const [index, name] of MODEL_FIELDS.entries()) {
      if (!fields.includes(name)) {
        await this.anki.invoke('modelFieldAdd', { modelName, fieldName: name, index });
      }
    }
    return false;
  }
}
