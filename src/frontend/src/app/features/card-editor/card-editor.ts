import { Component, inject } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Message } from 'primeng/message';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { CARD_SIDES, CardEditorStore, type CardSide } from './card-editor.store';
import { EditorToolbar } from './editor-toolbar/editor-toolbar';
import { LayoutPanel } from './layout-panel/layout-panel';
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
    Checkbox,
    Message,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    EditorToolbar,
    ResultsPanel,
    LayoutPanel,
  ],
  providers: [CardEditorStore],
  templateUrl: './card-editor.html',
})
export class CardEditor {
  protected readonly store = inject(CardEditorStore);
  private readonly router = inject(Router);

  protected readonly sides = CARD_SIDES;
  protected readonly sourcesForm = form(this.store.sourceToggles);

  protected selectSide(side: string | number | undefined): void {
    if (side === 'front' || side === 'back') {
      this.store.activeSide.set(side satisfies CardSide);
    }
  }

  protected editSavedCard(noteId: number): void {
    void this.router.navigate(['/cards', noteId, 'edit']);
  }
}
