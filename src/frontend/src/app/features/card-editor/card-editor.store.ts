import { httpResource } from '@angular/common/http';
import {
  Injectable,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { CardLayout, EntryField, TextDirection } from '../../card/card-field';
import { CARD_STATE_VERSION, encodeState, type CardState } from '../../card/card-state';
import { renderCardSide } from '../../card/render-card';
import { AnkiDecks } from '../../core/anki/anki-decks';
import { AnkiNotes, type LoadedCard } from '../../core/anki/anki-notes';
import { readStorage, writeStorage } from '../../core/browser/storage';
import { valueOf } from '../../core/resource';
import { Toasts } from '../../core/toasts';
import { dictionaryLookupRequest } from '../../core/dictionary/dictionary-api';
import type { DictionarySearchResult } from '../../core/dictionary/dictionary.models';
import {
  DEFAULT_LANGUAGE,
  languageLabel,
  sourcesForLanguage,
} from '../../core/dictionary/dictionary-sources';
import * as layouts from './card-layout';
import {
  buildResultTrees,
  checkedFieldKeys,
  collectFields,
  selectionKeysFor,
  sourcesWithResults,
  type ResultNode,
  type SelectionKeys,
} from './results-tree';

export type CardSide = 'front' | 'back';
export const CARD_SIDES: readonly CardSide[] = ['front', 'back'];

/** Which screen the card preview imitates - phones get larger card text (see card.css). */
export type PreviewDevice = 'desktop' | 'phone';
const PREVIEW_DEVICE_KEY = 'anki.previewDevice';

/** The search box's form model. */
export interface SearchQuery {
  language: string;
  word: string;
  sources: string[];
}

/**
 * Everything derived from one set of results: a fresh lookup, or a saved card's stored search
 * (re-editing never hits the network, so it can't drift if a dictionary site changed since).
 */
interface Session {
  readonly word: string;
  readonly search: DictionarySearchResult;
  readonly fields: ReadonlyMap<string, EntryField>;
  readonly initialLayouts: Record<CardSide, CardLayout>;
  /** Saved fields that no longer resolve against the stored search. */
  readonly droppedFields: number;
}

/**
 * One side of the card. Front and back show the same results but are edited independently: their
 * own layout, checkboxes, and expanded/collapsed panels.
 */
export class SideState {
  /** p-tree writes expansion and checkbox state onto its nodes, so each side builds its own. */
  readonly trees: Signal<ReadonlyMap<string, ResultNode[]>>;
  readonly layout: WritableSignal<CardLayout>;
  /**
   * Each source tree's checkboxes, derived from the layout - placed originals are exactly the
   * checked leaves, so there's no separate selection state to keep in sync.
   */
  readonly selectionKeys: Signal<ReadonlyMap<string, SelectionKeys>>;
  readonly expandedSources: WritableSignal<string[]>;
  readonly expandedGroups: WritableSignal<ReadonlySet<string>>;

  constructor(session: Signal<Session | null>, side: CardSide, resultSources: Signal<string[]>) {
    this.trees = computed(() => {
      const current = session();
      return current ? buildResultTrees(current.search) : new Map();
    });
    this.layout = linkedSignal(() => session()?.initialLayouts[side] ?? []);
    this.selectionKeys = computed(() => {
      const placed = layouts.placedOriginalKeys(this.layout());
      return new Map(
        [...this.trees()].map(([source, roots]) => [source, selectionKeysFor(roots, placed)]),
      );
    });
    this.expandedSources = linkedSignal(() => resultSources());
    this.expandedGroups = linkedSignal<Session | null, ReadonlySet<string>>({
      source: session,
      computation: () => new Set(),
    });
  }
}

/**
 * State and actions of one card editor - provided by the CardEditor page, so each visit starts
 * fresh. Opened as /cards/:noteId/edit it re-edits that saved card; otherwise it starts from a
 * dictionary search.
 */
@Injectable()
export class CardEditorStore {
  private readonly notes = inject(AnkiNotes);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  readonly decks = inject(AnkiDecks);

  readonly noteId: number | null = parseNoteId(
    inject(ActivatedRoute).snapshot.paramMap.get('noteId'),
  );
  readonly isEditing = this.noteId !== null;

  private readonly savedCard = resource({
    params: () => this.noteId ?? undefined,
    loader: async ({ params: noteId }) => {
      const card = await this.notes.load(noteId);
      if (card.deckName) {
        this.decks.selectDeck(card.deckName);
      }
      return card;
    },
  });

  // --- search ---

  readonly query = linkedSignal<SearchQuery>(() => {
    const state = valueOf(this.savedCard)?.state;
    return state
      ? { language: state.language, word: '', sources: state.sources }
      : { language: DEFAULT_LANGUAGE, word: '', sources: sourceKeys(DEFAULT_LANGUAGE) };
  });

  readonly availableSources = computed(() => sourcesForLanguage(this.query().language));
  readonly languageLabel = computed(() => languageLabel(this.query().language));

  private readonly submitted = signal<{ word: string; sources: string[] } | null>(null);

  private readonly lookup = httpResource<DictionarySearchResult>(() => {
    const search = this.submitted();
    return search ? dictionaryLookupRequest(search.word, search.sources) : undefined;
  });

  /** Runs a lookup for the typed word, and clears the box ready for the next one. */
  search(): void {
    const { language, word, sources } = this.query();
    const trimmed = word.trim();
    if (!trimmed) {
      return;
    }
    // Sources picked under another language don't apply; none left means "all of this language's".
    const available = sourceKeys(language);
    const picked = sources.filter((source) => available.includes(source));
    this.submitted.set({ word: trimmed, sources: picked.length ? picked : available });
    this.query.update((query) => ({ ...query, word: '' }));
    // A new search starts a new card, so it starts unflagged.
    this.flag.set(0);
  }

  clearSearch(): void {
    this.query.update((query) => ({ ...query, word: '' }));
    this.submitted.set(null);
  }

  // --- results ---

  private readonly session = computed<Session | null>(() => {
    if (this.isEditing) {
      const card = valueOf(this.savedCard);
      return card ? restoreSession(card) : null;
    }
    const search = valueOf(this.lookup);
    const submitted = this.submitted();
    return search && submitted ? newSession(submitted.word, search) : null;
  });

  readonly word = computed(() => this.session()?.word ?? this.submitted()?.word ?? '');
  readonly droppedFields = computed(() => this.session()?.droppedFields ?? 0);

  // Reported once, as soon as a saved card's layout has been restored.
  private readonly reportDroppedFields = effect(() => {
    const dropped = this.droppedFields();
    if (dropped) {
      this.toasts.warn(
        `${dropped} field(s) couldn’t be restored`,
        'The dictionary result changed since this card was saved. Saving now will drop them.',
      );
    }
  });

  readonly status = computed<'idle' | 'loading' | 'error' | 'ready'>(() => {
    const source = this.isEditing ? this.savedCard : this.lookup;
    if (source.isLoading()) return 'loading';
    if (source.error()) return 'error';
    return this.session() ? 'ready' : 'idle';
  });

  readonly error = computed(
    () => (this.isEditing ? this.savedCard : this.lookup).error()?.message ?? null,
  );

  /** Sources that returned something, each with a checkbox toggling whether it's shown. */
  readonly resultSources = computed(() => {
    const session = this.session();
    return session ? sourcesWithResults(session.search) : [];
  });

  readonly sourceToggles = linkedSignal<Record<string, boolean>>(() =>
    Object.fromEntries(this.resultSources().map((source) => [source, true])),
  );

  readonly visibleSources = computed(() =>
    this.resultSources().filter((source) => this.sourceToggles()[source]),
  );

  // --- the two sides ---

  readonly activeSide = signal<CardSide>('front');

  /** Shared by both sides' previews and remembered between visits. */
  readonly previewDevice = signal<PreviewDevice>(
    readStorage(PREVIEW_DEVICE_KEY) === 'phone' ? 'phone' : 'desktop',
  );

  setPreviewDevice(device: PreviewDevice): void {
    this.previewDevice.set(device);
    writeStorage(PREVIEW_DEVICE_KEY, device);
  }

  readonly sides: Record<CardSide, SideState> = {
    front: new SideState(this.session, 'front', this.resultSources),
    back: new SideState(this.session, 'back', this.resultSources),
  };

  /** Applies the checkboxes one source's results tree reports after a click. */
  setChecked(
    side: CardSide,
    source: string,
    keys: Record<string, { checked?: boolean } | boolean> | null,
  ): void {
    const fields = this.session()?.fields ?? new Map<string, EntryField>();
    this.updateLayout(side, (layout) => {
      const otherSources = [...layouts.placedOriginalKeys(layout)].filter(
        (key) => fields.get(key)?.sourceLabel !== source,
      );
      const checked = new Set([...otherSources, ...checkedFieldKeys(keys, fields)]);
      return layouts.reconcile(layout, checked, fields);
    });
  }

  removeField(side: CardSide, instanceKey: string): void {
    this.updateLayout(side, (layout) => layouts.removeField(layout, instanceKey));
  }

  removeGroup(side: CardSide, groupKey: string): void {
    this.updateLayout(side, (layout) => layouts.removeGroup(layout, groupKey));
  }

  duplicateField(side: CardSide, instanceKey: string): void {
    const id = this.nextId();
    this.updateLayout(side, (layout) => layouts.duplicateField(layout, instanceKey, id));
  }

  addRichText(side: CardSide, direction: TextDirection): void {
    const id = this.nextId();
    this.updateLayout(side, (layout) => layouts.addRichText(layout, id, direction));
  }

  /** Exchanges everything placed on Front and Back - for when a side was built on the wrong tab. */
  swapSides(): void {
    const { front, back } = this.sides;
    const [frontLayout, frontGroups] = [front.layout(), front.expandedGroups()];
    front.layout.set(back.layout());
    front.expandedGroups.set(back.expandedGroups());
    back.layout.set(frontLayout);
    back.expandedGroups.set(frontGroups);
  }

  readonly canSwapSides = computed(
    () => this.sides.front.layout().length > 0 || this.sides.back.layout().length > 0,
  );

  private updateLayout(side: CardSide, change: (layout: CardLayout) => CardLayout): void {
    this.sides[side].layout.update(change);
  }

  private nextId(): number {
    return layouts.nextId(CARD_SIDES.map((side) => this.sides[side].layout()));
  }

  // --- saving to Anki ---

  readonly saving = signal(false);

  /** The Anki flag the card gets on save (0 = none) - starts from the saved card's own. */
  readonly flag = linkedSignal(() => valueOf(this.savedCard)?.flag ?? 0);
  /** The edited card's flag as Anki has it now - so only a real change is sent. */
  private readonly ankiFlag = linkedSignal(() => valueOf(this.savedCard)?.flag ?? 0);

  /** Needs a deck and something on both sides - a one-sided card isn't worth sending. */
  readonly canSave = computed(
    () =>
      !!this.decks.selectedDeck() &&
      this.sides.front.layout().length > 0 &&
      this.sides.back.layout().length > 0,
  );

  async save(): Promise<void> {
    const deckName = this.decks.selectedDeck();
    const session = this.session();
    if (!deckName || !session || this.saving() || !this.canSave()) {
      return;
    }

    this.saving.set(true);
    const content = {
      language: this.query().language,
      front: renderCardSide(this.sides.front.layout()),
      back: renderCardSide(this.sides.back.layout()),
      state: encodeState(this.cardState(session)),
      deckName,
    };

    const verb = this.isEditing ? 'save' : 'add';
    try {
      const saved = valueOf(this.savedCard);
      const updated = this.noteId !== null && !!saved;
      let noteId: number;
      if (this.noteId !== null && saved) {
        await this.notes.update(this.noteId, saved.cardIds, content);
        noteId = this.noteId;
      } else {
        noteId = await this.notes.add(content);
      }
      // The note is in Anki by now, so a failed flag change is reported on its own below.
      const flag = this.flag();
      const current = updated ? this.ankiFlag() : 0;
      const flagError = flag !== current ? await this.applyFlag(noteId, flag) : null;
      if (updated && !flagError) {
        this.ankiFlag.set(flag);
      }

      // The next card (or another pass over this one) starts from the front again.
      this.activeSide.set('front');
      const showInAnki = { label: 'Show in Anki', run: () => this.showInAnki(noteId) };
      const edit = {
        label: 'Edit',
        run: () => void this.router.navigate(['/cards', noteId, 'edit']),
      };
      this.toasts.success(
        updated ? 'Card saved' : 'Card added',
        `${updated ? 'Saved' : 'Added'} to ${deckName} as a ${this.languageLabel()}-Dictionary note.`,
        updated ? [showInAnki] : [showInAnki, edit],
      );
      if (flagError) {
        this.toasts.error('Couldn’t set the card’s flag', flagError);
      }
    } catch (error) {
      this.toasts.error(`Couldn’t ${verb} the card`, errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Sets the note's flag in Anki, returning why it failed (or null). */
  private async applyFlag(noteId: number, flag: number): Promise<string | null> {
    try {
      await this.notes.setFlag(noteId, flag);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  showInAnki(noteId: number): void {
    void this.notes.showInBrowser(noteId);
  }

  readonly pushingStyling = signal(false);

  /** Re-pushes the compiled card styling to Anki's note type, without adding or changing a card. */
  async pushStyling(): Promise<void> {
    if (this.pushingStyling()) {
      return;
    }
    this.pushingStyling.set(true);
    try {
      await this.notes.pushStyling(this.query().language);
      this.toasts.success(
        'Anki styling updated',
        `Pushed the current styling to the ${this.languageLabel()}-Dictionary note type.`,
      );
    } catch (error) {
      this.toasts.error('Couldn’t update the Anki styling', errorMessage(error));
    } finally {
      this.pushingStyling.set(false);
    }
  }

  private cardState(session: Session): CardState {
    return {
      v: CARD_STATE_VERSION,
      language: this.query().language,
      word: session.word,
      sources: session.search.results.map((result) => result.source),
      search: session.search,
      front: layouts.serializeLayout(this.sides.front.layout()),
      back: layouts.serializeLayout(this.sides.back.layout()),
    };
  }
}

function newSession(word: string, search: DictionarySearchResult): Session {
  return {
    word,
    search,
    fields: collectFields(buildResultTrees(search).values()),
    initialLayouts: { front: [], back: [] },
    droppedFields: 0,
  };
}

function restoreSession({ state }: LoadedCard): Session {
  const { fields, front, back, dropped } = layouts.restoreCard(state);
  return {
    word: state.word,
    search: state.search,
    fields,
    initialLayouts: { front, back },
    droppedFields: dropped,
  };
}

function sourceKeys(language: string): string[] {
  return sourcesForLanguage(language).map((source) => source.key);
}

function parseNoteId(value: string | null): number | null {
  const id = Number(value);
  return value && Number.isInteger(id) ? id : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
