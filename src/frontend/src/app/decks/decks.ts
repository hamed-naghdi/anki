import { Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { TreeTable, TreeTableToggler } from 'primeng/treetable';
import { Plus } from '@primeicons/angular/plus';
import { DeckService } from '../core/deck.service';
import { AnkiConnectResponse, ankiConnectRequest } from '../core/anki-connect';
import { StyleClass } from 'primeng/styleclass';

interface DeckStats {
  new_count: number;
  learn_count: number;
  review_count: number;
}

@Component({
  imports: [ButtonDirective, RouterLink, Plus, TreeTable, TreeTableToggler, StyleClass],
  selector: 'app-decks',
  styles: ``,
  templateUrl: './decks.html',
})
export class Decks {
  protected readonly deckService = inject(DeckService);

  // Deck stats are keyed by deck id, not name, so deckNamesAndIds gives us the id to look up
  // getDeckStats results by; the deck names themselves already come from DeckService.
  private readonly idsResource = httpResource<AnkiConnectResponse<Record<string, number>>>(() =>
    ankiConnectRequest('deckNamesAndIds'),
  );

  private readonly statsResource = httpResource<AnkiConnectResponse<Record<string, DeckStats>>>(
    () => {
      const decks = this.deckService.decks();
      return decks.length ? ankiConnectRequest('getDeckStats', { decks }) : undefined;
    },
  );

  protected readonly isLoading = computed(
    () =>
      this.deckService.isLoading() ||
      this.idsResource.isLoading() ||
      this.statsResource.isLoading(),
  );

  protected readonly statsByPath = computed(() => {
    const ids = this.idsResource.value()?.result ?? {};
    const stats = this.statsResource.value()?.result ?? {};
    const byPath = new Map<string, DeckStats>();
    for (const [path, id] of Object.entries(ids)) {
      const entry = stats[String(id)];
      if (entry) {
        byPath.set(path, entry);
      }
    }
    return byPath;
  });
}
