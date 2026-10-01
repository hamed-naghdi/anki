import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TreeNode } from 'primeng/api';
import { TreeSelect } from 'primeng/treeselect';
import { AnkiDecks } from '../../../core/anki/anki-decks';

/**
 * Picks the Anki deck a card goes into - shared with the rest of the app via AnkiDecks.
 *
 * Bound with ngModel rather than Signal Forms on purpose: p-treeselect's value is a PrimeNG tree
 * node, which links back to its `parent`, and Signal Forms walks its model value recursively -
 * a nested deck ("English::IELTS") sends that walk round the parent/child cycle forever.
 */
@Component({
  selector: 'app-deck-picker',
  imports: [TreeSelect, FormsModule],
  template: `
    <div class="flex flex-col gap-1">
      <p-treeselect
        [ngModel]="decks.selectedNode()"
        (ngModelChange)="select($event)"
        [options]="decks.deckTree()"
        [loading]="decks.isLoading()"
        selectionMode="single"
        placeholder="Deck"
        class="w-64"
      />
      @if (decks.error(); as error) {
        <span class="text-xs text-red-500">{{ error }}</span>
      }
    </div>
  `,
})
export class DeckPicker {
  protected readonly decks = inject(AnkiDecks);

  protected select(node: TreeNode | null): void {
    if (node?.key) {
      this.decks.selectDeck(node.key);
    }
  }
}
