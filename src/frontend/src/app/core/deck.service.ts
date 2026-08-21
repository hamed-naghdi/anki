import { Injectable, computed } from '@angular/core';
import { TreeNode } from 'primeng/api';
import { createPersistedListResource } from './persisted-list-resource';

/** Decks live in Anki - fetched directly from AnkiConnect (action "deckNames"). */
@Injectable({ providedIn: 'root' })
export class DeckService {
  private readonly resource = createPersistedListResource('deckNames', 'anki.selectedDeck');

  readonly decks = this.resource.items;
  readonly deckTree = computed(() => buildDeckTree(this.resource.items()));
  readonly isLoading = this.resource.isLoading;
  readonly error = this.resource.error;
  readonly selectedDeck = this.resource.selected;
  readonly selectedNode = computed(() => findNode(this.deckTree(), this.selectedDeck()));

  selectDeck(deck: string): void {
    this.resource.select(deck);
  }

  selectNode(node: TreeNode | null): void {
    if (node?.key) {
      this.resource.select(node.key);
    }
  }

  reload(): void {
    this.resource.reload();
  }
}

/**
 * Anki encodes deck hierarchy in the name itself (e.g. "Parent::Child"), and always creates every
 * ancestor as a real deck too - so each "::" segment along the way is a valid, selectable node.
 */
function buildDeckTree(names: string[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const byPath = new Map<string, TreeNode>();

  for (const name of [...names].sort()) {
    const parts = name.split('::');
    let path = '';
    let siblings = roots;
    for (const part of parts) {
      path = path ? `${path}::${part}` : part;
      let node = byPath.get(path);
      if (!node) {
        // Expanded by default (p-treetable reads each node's own `expanded` flag).
        node = { key: path, label: part, data: path, children: [], expanded: true };
        byPath.set(path, node);
        siblings.push(node);
      }
      siblings = node.children!;
    }
  }

  removeEmptyChildren(roots);
  return roots;
}

function removeEmptyChildren(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (!node.children?.length) {
      delete node.children;
    } else {
      removeEmptyChildren(node.children);
    }
  }
}

function findNode(nodes: TreeNode[], key: string | null): TreeNode | null {
  if (!key) {
    return null;
  }
  for (const node of nodes) {
    if (node.key === key) {
      return node;
    }
    const found = node.children && findNode(node.children, key);
    if (found) {
      return found;
    }
  }
  return null;
}
