import { Injectable, computed, effect, signal } from '@angular/core';
import type { TreeNode } from 'primeng/api';
import { ankiErrorMessage, ankiResource } from './anki-connect';
import { readStorage, writeStorage } from '../browser/storage';
import { valueOf } from '../resource';

const SELECTED_DECK_KEY = 'anki.selectedDeck';

/**
 * Anki's decks (AnkiConnect `deckNames`), plus which one new cards go into. The choice is
 * persisted across sessions; if the remembered deck no longer exists (renamed or deleted in Anki)
 * it falls back to the first deck Anki reports.
 */
@Injectable({ providedIn: 'root' })
export class AnkiDecks {
  private readonly names = ankiResource<string[]>(() => ({ action: 'deckNames' }));
  private readonly chosen = signal(readStorage(SELECTED_DECK_KEY));

  readonly decks = computed(() => valueOf(this.names) ?? []);
  readonly deckTree = computed(() => buildDeckTree(this.decks()));
  readonly isLoading = this.names.isLoading;
  readonly error = computed(() => ankiErrorMessage(this.names.error()));

  readonly selectedDeck = computed(() => {
    const decks = this.decks();
    const chosen = this.chosen();
    if (chosen && decks.includes(chosen)) {
      return chosen;
    }
    // Keep showing the remembered choice while the list is still loading.
    return decks[0] ?? chosen;
  });

  readonly selectedNode = computed(() => findNode(this.deckTree(), this.selectedDeck()));

  constructor() {
    effect(() => {
      const deck = this.selectedDeck();
      if (deck) {
        writeStorage(SELECTED_DECK_KEY, deck);
      }
    });
  }

  selectDeck(deck: string): void {
    this.chosen.set(deck);
  }

  reload(): void {
    this.names.reload();
  }
}

/**
 * Anki encodes deck hierarchy in the name itself ("Parent::Child") and always creates every
 * ancestor as a real deck too, so each "::" segment along the way is a selectable node keyed by
 * its full path.
 */
export function buildDeckTree(names: readonly string[]): TreeNode<string>[] {
  const roots: TreeNode<string>[] = [];
  const byPath = new Map<string, TreeNode<string>>();

  for (const name of [...names].sort()) {
    let path = '';
    let siblings = roots;
    for (const part of name.split('::')) {
      path = path ? `${path}::${part}` : part;
      let node = byPath.get(path);
      if (!node) {
        node = { key: path, label: part, data: path, expanded: true };
        byPath.set(path, node);
        siblings.push(node);
      }
      siblings = node.children ??= [];
    }
  }

  pruneEmptyChildren(roots);
  return roots;
}

function pruneEmptyChildren(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (node.children?.length) {
      pruneEmptyChildren(node.children);
    } else {
      delete node.children;
    }
  }
}

function findNode<T>(nodes: readonly TreeNode<T>[], key: string | null): TreeNode<T> | null {
  for (const node of key ? nodes : []) {
    if (node.key === key) {
      return node;
    }
    const found = findNode(node.children ?? [], key);
    if (found) {
      return found;
    }
  }
  return null;
}
