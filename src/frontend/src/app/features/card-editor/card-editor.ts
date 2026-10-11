import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ArrowLeft } from '@primeicons/angular/arrow-left';
import { File as FileIcon } from '@primeicons/angular/file';
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { FROM_CARD_LIST } from '../cards/card-filters';
import { CARD_SIDES, CardEditorStore, type CardSide } from './card-editor.store';
import { EditorToolbar } from './editor-toolbar/editor-toolbar';
import { LayoutPanel } from './layout-panel/layout-panel';
import { PreviewPanel } from './preview-panel/preview-panel';
import { ResultsPanel } from './results-panel/results-panel';

/**
 * Builds a card from dictionary results - /cards/new - or re-edits a saved one -
 * /cards/:noteId/edit. Each visit gets its own CardEditorStore.
 */
@Component({
  selector: 'app-card-editor',
  imports: [
    RouterLink,
    FormField,
    ButtonDirective,
    ArrowLeft,
    FileIcon,
    Checkbox,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    EditorToolbar,
    ResultsPanel,
    LayoutPanel,
    PreviewPanel,
  ],
  providers: [CardEditorStore],
  templateUrl: './card-editor.html',
})
export class CardEditor {
  protected readonly store = inject(CardEditorStore);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Opened from a card list row (not a toast, link or reload) - so Back can restore that list. */
  private readonly fromCardList =
    (this.location.getState() as Partial<typeof FROM_CARD_LIST> | null)?.fromCardList === true;

  protected readonly sides = CARD_SIDES;
  protected readonly sourcesForm = form(this.store.sourceToggles);

  /** Back to the card list as it was left (filters included), or to a fresh list otherwise. */
  protected back(): void {
    if (this.fromCardList) {
      this.location.back();
    } else {
      void this.router.navigate(['/cards']);
    }
  }

  protected selectSide(side: string | number | undefined): void {
    if (side === 'front' || side === 'back') {
      this.store.activeSide.set(side satisfies CardSide);
    }
  }
}
