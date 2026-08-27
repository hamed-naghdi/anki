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

/**
 * Owns the per-language dictionary note types in Anki (En-Dictionary, ...). "Add to Anki" is the
 * only entry point: it creates the note type on first use and re-pushes its styling + card
 * templates whenever the version compiled into the app is newer than the one stored in Anki.
 * Existing notes and their field content are never touched.
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
        fields: { Front: frontHtml, Back: backHtml },
        tags: ['personal-dictionary'],
        options: { allowDuplicate: false, duplicateScope: 'deck' },
      },
    });
  }

  /** Open Anki's card browser filtered to a note we just added. */
  async showInBrowser(noteId: number): Promise<void> {
    await this.anki.invoke('guiBrowse', { query: `nid:${noteId}` });
  }

  private async ensureModel(modelName: string, css: string): Promise<void> {
    const names = await this.anki.invoke<string[]>('modelNames');

    if (!names.includes(modelName)) {
      await this.anki.invoke('createModel', {
        modelName,
        inOrderFields: [...MODEL_FIELDS],
        css,
        isCloze: false,
        cardTemplates: CARD_TEMPLATES,
      });
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
}
