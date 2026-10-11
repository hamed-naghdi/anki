import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { Flag } from '@primeicons/angular/flag';
import { FlagFill } from '@primeicons/angular/flag-fill';
import { Plus } from '@primeicons/angular/plus';
import { Refresh } from '@primeicons/angular/refresh';
import { Search } from '@primeicons/angular/search';
import { Times } from '@primeicons/angular/times';
import type { TreeNode } from 'primeng/api';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TreeSelect } from 'primeng/treeselect';
import { buildDeckTree, findNode } from '../../core/anki/anki-decks';
import { FLAG_OPTIONS, ankiFlag } from '../../core/anki/anki-flags';
import { AnkiNotes, type CardSummary, type RenderedNote } from '../../core/anki/anki-notes';
import { valueOf } from '../../core/resource';
import { Toasts } from '../../core/toasts';
import { CardFilters, FROM_CARD_LIST, NO_FILTER } from './card-filters';
import { renderStatus, type RenderStatus } from './render-status';

/** Every dictionary card in Anki, newest first, each opening in the editor. */
@Component({
  selector: 'app-cards',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FormsModule,
    FormField,
    ButtonDirective,
    IconField,
    InputIcon,
    InputText,
    Select,
    TreeSelect,
    Flag,
    FlagFill,
    Plus,
    Refresh,
    Search,
    Times,
  ],
  templateUrl: './cards.html',
})
export class Cards {
  private readonly notes = inject(AnkiNotes);
  private readonly toasts = inject(Toasts);

  protected readonly ankiFlag = ankiFlag;
  protected readonly fromCardList = FROM_CARD_LIST;

  protected readonly cards = resource({ loader: () => this.notes.list() });

  protected readonly flagOptions = [...FLAG_OPTIONS];

  /** Kept app-wide (see CardFilters). A deck includes its subdecks, as in Anki. */
  protected readonly filter = inject(CardFilters).filter;
  protected readonly filterForm = form(this.filter);

  constructor() {
    // Only going back (history pop) returns to the filtered list; any other arrival starts fresh.
    if (inject(Router).currentNavigation()?.trigger !== 'popstate') {
      this.filter.set(NO_FILTER);
    }
  }

  /** Only the decks that hold cards (plus their parents), so every choice matches something. */
  protected readonly deckTree = computed(() =>
    buildDeckTree([...new Set((valueOf(this.cards) ?? []).map((card) => card.deck))]),
  );
  protected readonly selectedDeckNode = computed(() =>
    findNode(this.deckTree(), this.filter().deck),
  );
  /** The remembered deck, unless no card is in it any more (moved or deleted since). */
  private readonly deck = computed(() => this.selectedDeckNode()?.key ?? null);

  protected readonly isFiltered = computed(() => {
    const { term, flag } = this.filter();
    return !!term.trim() || flag !== null || this.deck() !== null;
  });

  protected readonly filteredCards = computed(() => {
    const cards = valueOf(this.cards) ?? [];
    const { flag } = this.filter();
    const deck = this.deck();
    const term = this.filter().term.trim().toLowerCase();
    return cards.filter(
      (card) =>
        (flag === null || card.flag === flag) &&
        (deck === null || card.deck === deck || card.deck.startsWith(`${deck}::`)) &&
        (!term ||
          card.word.toLowerCase().includes(term) ||
          card.deck.toLowerCase().includes(term)),
    );
  });

  // The deck picker uses ngModel, not Signal Forms: its value is a PrimeNG tree node, whose
  // `parent` link would send Signal Forms' recursive walk round in circles (see DeckPicker).
  protected selectDeck(node: TreeNode | null): void {
    this.filter.update((filter) => ({ ...filter, deck: node?.key ?? null }));
  }

  protected clearTerm(): void {
    this.filter.update((filter) => ({ ...filter, term: '' }));
  }

  protected clearFilters(): void {
    this.filter.set(NO_FILTER);
  }

  // --- re-rendering: rewriting a card's Front/Back from its State with the current layout code ---

  /** Each editable card's render status, by note id. */
  protected readonly statuses = computed(
    () =>
      new Map(
        (valueOf(this.cards) ?? [])
          .filter((card) => card.editable)
          .map((card) => [card.noteId, renderStatus(card)]),
      ),
  );

  protected readonly outdated = computed(() =>
    [...this.statuses()].flatMap(([noteId, status]) =>
      status.kind === 'outdated' ? [{ noteId, ...status }] : [],
    ),
  );

  /** What's being re-rendered: one note, or all outdated ones (with progress). */
  protected readonly rerendering = signal<
    { noteId: number } | { done: number; total: number } | null
  >(null);

  protected statusOf(card: CardSummary): RenderStatus | undefined {
    return this.statuses().get(card.noteId);
  }

  protected isRerendering(noteId: number): boolean {
    const current = this.rerendering();
    return !!current && 'noteId' in current && current.noteId === noteId;
  }

  protected rerenderOne(card: CardSummary): void {
    const status = this.statusOf(card);
    if (status?.kind === 'outdated') {
      void this.rerender([{ noteId: card.noteId, ...status }], { noteId: card.noteId }, card.word);
    }
  }

  protected rerenderAll(): void {
    const notes = this.outdated();
    void this.rerender(notes, { done: 0, total: notes.length });
  }

  private async rerender(
    notes: readonly RenderedNote[],
    progress: { noteId: number } | { done: number; total: number },
    word?: string,
  ): Promise<void> {
    if (this.rerendering() || !notes.length) {
      return;
    }
    this.rerendering.set(progress);
    let done = 0;
    try {
      await this.notes.rerender(notes, (count) => {
        done = count;
        if ('total' in progress) this.rerendering.set({ done, total: progress.total });
      });
      this.toasts.success(
        word ? 'Card re-rendered' : 'Cards re-rendered',
        word
          ? `“${word}” now uses the current card layout.`
          : `Updated ${done} card${done === 1 ? '' : 's'} in Anki to the current card layout.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.toasts.error(
        word ? 'Couldn’t re-render the card' : 'Couldn’t re-render the cards',
        word ? message : `${done} of ${notes.length} were updated before it failed: ${message}`,
      );
    } finally {
      // The written notes now hold exactly what was rendered - update them in place rather than
      // reloading the whole list from Anki.
      const written = new Map(notes.slice(0, done).map((note) => [note.noteId, note]));
      this.cards.update((cards) =>
        cards?.map((card) => {
          const note = written.get(card.noteId);
          return note
            ? { ...card, fields: { ...card.fields, front: note.front, back: note.back } }
            : card;
        }),
      );
      this.rerendering.set(null);
    }
  }
}
