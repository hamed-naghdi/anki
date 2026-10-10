import { Component, computed, inject, input } from '@angular/core';
import { Desktop } from '@primeicons/angular/desktop';
import { Mobile } from '@primeicons/angular/mobile';
import { ButtonDirective } from 'primeng/button';
import { CardHtml } from '../../../card/card-html';
import { renderCardSide } from '../../../card/render-card';
import { CardEditorStore, type CardSide, type PreviewDevice } from '../card-editor.store';

/** One side's card as a live preview - the exact HTML Anki will store - on a desktop or a phone. */
@Component({
  selector: 'app-preview-panel',
  imports: [ButtonDirective, CardHtml, Desktop, Mobile],
  templateUrl: './preview-panel.html',
  // The last column (xl), a third of the row: it sticks to the top of the viewport so the preview stays in view while
  // the results grow, scrolling on its own if it's taller than the screen.
  host: {
    class:
      'flex min-w-0 flex-col gap-4 border-t border-surface-200 p-4 xl:sticky xl:top-0 xl:max-h-dvh xl:flex-1 xl:self-start xl:overflow-y-auto xl:border-t-0 dark:border-surface-700',
  },
})
export class PreviewPanel {
  readonly side = input.required<CardSide>();

  protected readonly store = inject(CardEditorStore);

  protected readonly preview = computed(() =>
    renderCardSide(this.store.sides[this.side()].layout()),
  );

  protected readonly devices: { value: PreviewDevice; label: string }[] = [
    { value: 'desktop', label: 'Desktop' },
    { value: 'phone', label: 'Phone' },
  ];
}
