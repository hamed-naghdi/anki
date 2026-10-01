import { Component, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { FormField, FormRoot, disabled, form } from '@angular/forms/signals';
import { ArrowsH } from '@primeicons/angular/arrows-h';
import { Plus } from '@primeicons/angular/plus';
import { Refresh } from '@primeicons/angular/refresh';
import { Search } from '@primeicons/angular/search';
import { Times } from '@primeicons/angular/times';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { LANGUAGES } from '../../../core/dictionary/dictionary-sources';
import { CardEditorStore } from '../card-editor.store';
import { DeckPicker } from './deck-picker';

/** Search box and source/deck pickers, plus the actions that send the card to Anki. */
@Component({
  selector: 'app-editor-toolbar',
  imports: [
    FormRoot,
    FormField,
    Select,
    IconField,
    InputIcon,
    InputText,
    ButtonDirective,
    DeckPicker,
    ArrowsH,
    Plus,
    Refresh,
    Search,
    Times,
  ],
  templateUrl: './editor-toolbar.html',
})
export class EditorToolbar {
  protected readonly store = inject(CardEditorStore);
  protected readonly languages = [...LANGUAGES];

  // A re-edited card keeps the search it was made from, so its language and word are fixed.
  protected readonly searchForm = form(
    this.store.query,
    (query) => {
      disabled(query.language, () => this.store.isEditing);
      disabled(query.word, () => this.store.isEditing);
    },
    { submission: { action: async () => this.store.search() } },
  );

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // A new card always starts with a search, so the box is ready to type into.
    if (!this.store.isEditing) {
      afterNextRender(() => this.searchInput()?.nativeElement.focus());
    }
  }
}
