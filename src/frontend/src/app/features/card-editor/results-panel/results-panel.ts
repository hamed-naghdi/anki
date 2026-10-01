import { Component, computed, inject, input } from '@angular/core';
import { Accordion, AccordionContent, AccordionHeader, AccordionPanel } from 'primeng/accordion';
import { ButtonDirective } from 'primeng/button';
import { Tree } from 'primeng/tree';
import type { EntryField } from '../../../card/card-field';
import { CardHtml } from '../../../card/card-html';
import { renderField } from '../../../card/render-card';
import { CardEditorStore, type CardSide } from '../card-editor.store';
import type { ResultNode } from '../results-tree';
import { EntrySummary } from './entry-summary';

// Fields are immutable, so each one's chip only ever needs rendering once.
const chipCache = new WeakMap<EntryField, string>();

/** One side's view of the search results: an accordion per source, each a checkbox tree. */
@Component({
  selector: 'app-results-panel',
  imports: [
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    Tree,
    ButtonDirective,
    CardHtml,
    EntrySummary,
  ],
  templateUrl: './results-panel.html',
  host: { class: 'flex min-w-0 flex-1 flex-col gap-4 p-4' },
})
export class ResultsPanel {
  readonly side = input.required<CardSide>();

  protected readonly store = inject(CardEditorStore);
  protected readonly state = computed(() => this.store.sides[this.side()]);

  protected readonly allExpanded = computed(() => {
    const expanded = this.state().expandedSources();
    return this.store.visibleSources().every((source) => expanded.includes(source));
  });

  protected toggleExpandAll(): void {
    this.state().expandedSources.set(this.allExpanded() ? [] : [...this.store.visibleSources()]);
  }

  protected onExpandedChange(
    value: string | number | (string | number)[] | null | undefined,
  ): void {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    this.state().expandedSources.set(values.map(String));
  }

  protected treeFor(source: string): ResultNode[] {
    return this.state().trees().get(source) ?? [];
  }

  protected selectionKeysFor(source: string) {
    return this.state().selectionKeys().get(source) ?? {};
  }

  // The tree's own grouping already shows an example's collocation/pattern header, so the chip
  // leaves the phrase out (and doesn't indent).
  protected chip(field: EntryField): string {
    let html = chipCache.get(field);
    if (html === undefined) {
      html = renderField(field, { underHeader: true, indent: false });
      chipCache.set(field, html);
    }
    return html;
  }
}
