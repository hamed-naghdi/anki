import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Plus } from '@primeicons/angular/plus';
import { ButtonDirective } from 'primeng/button';
import { TreeTable, TreeTableToggler } from 'primeng/treetable';
import { AnkiDecks } from '../../core/anki/anki-decks';
import { ankiErrorMessage, ankiResource } from '../../core/anki/anki-connect';
import { valueOf } from '../../core/resource';

interface DeckStats {
  new_count: number;
  learn_count: number;
  review_count: number;
}

/** Anki's deck tree with each deck's new / learning / due counts. */
@Component({
  selector: 'app-decks',
  imports: [ButtonDirective, RouterLink, Plus, TreeTable, TreeTableToggler],
  templateUrl: './decks.html',
})
export class Decks {
  protected readonly decks = inject(AnkiDecks);

  // Stats come back keyed by deck id, so deckNamesAndIds maps them back to deck names.
  private readonly ids = ankiResource<Record<string, number>>(() => ({
    action: 'deckNamesAndIds',
  }));
  private readonly stats = ankiResource<Record<string, DeckStats>>(() => {
    const decks = this.decks.decks();
    return decks.length ? { action: 'getDeckStats', params: { decks } } : undefined;
  });

  protected readonly isLoading = computed(
    () => this.decks.isLoading() || this.ids.isLoading() || this.stats.isLoading(),
  );

  protected readonly error = computed(
    () => this.decks.error() ?? ankiErrorMessage(this.ids.error() ?? this.stats.error()),
  );

  private readonly statsByDeck = computed(() => {
    const stats = valueOf(this.stats) ?? {};
    return new Map(
      Object.entries(valueOf(this.ids) ?? {}).flatMap(([deck, id]) => {
        const entry = stats[String(id)];
        return entry ? [[deck, entry] as const] : [];
      }),
    );
  });

  protected countsFor(deck: string): { new: number; learn: number; due: number } {
    const stats = this.statsByDeck().get(deck);
    return {
      new: stats?.new_count ?? 0,
      learn: stats?.learn_count ?? 0,
      due: stats?.review_count ?? 0,
    };
  }
}
