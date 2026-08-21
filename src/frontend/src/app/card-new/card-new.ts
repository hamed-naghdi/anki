import { Component, inject, signal } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { TreeSelect } from 'primeng/treeselect';
import { Search } from '@primeicons/angular/search';
import { Times } from '@primeicons/angular/times';
import { DeckService } from '../core/deck.service';
import { NoteTypeService } from '../core/note-type.service';

@Component({
  imports: [
    ButtonDirective,
    IconField,
    InputIcon,
    InputText,
    ReactiveFormsModule,
    Select,
    TreeSelect,
    FormsModule,
    Search,
    Times,
  ],
  selector: 'app-card-new',
  styles: ``,
  templateUrl: './card-new.html',
})
export class CardNew {
  // Decks and note types come directly from Anki via AnkiConnect (no backend involvement).
  protected readonly deckService = inject(DeckService);
  protected readonly noteTypeService = inject(NoteTypeService);

  searchTerm = signal('');

  // UI/UX only for now - clicking Search doesn't fetch anything yet.
  protected onSearch(): void {}

  protected onClearSearch(): void {
    this.searchTerm.set('');
  }
}
