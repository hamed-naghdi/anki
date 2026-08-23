import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Checkbox } from 'primeng/checkbox';
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
import {
  DICTIONARY_SOURCES,
  DictionarySearchResult,
  DictionarySourceOption,
  dictionaryLookupRequest,
} from '../core/dictionary-api';

@Component({
  imports: [
    Checkbox,
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

  protected readonly dictionarySources: DictionarySourceOption[] = [...DICTIONARY_SOURCES];

  searchTerm = signal('');
  protected readonly selectedSources = signal<string[]>(DICTIONARY_SOURCES.map((source) => source.key));

  // Separate from searchTerm so results only refresh on Enter, not on every keystroke - selected
  // sources still narrow/widen an already-submitted search live, since that's just a result filter.
  protected readonly submittedTerm = signal('');

  protected readonly searchResource = httpResource<DictionarySearchResult>(() => {
    const word = this.submittedTerm();
    const sources = this.selectedSources();
    return word && sources.length ? dictionaryLookupRequest(word, sources) : undefined;
  });

  protected readonly hasSearched = computed(() => this.submittedTerm().length > 0);
  protected readonly searchError = computed(() => this.searchResource.error()?.message ?? null);
  protected readonly sourceResults = computed(() => this.searchResource.value()?.results ?? []);

  // Only sources that actually came back with something to show - a source queried but empty
  // (or errored) doesn't belong in this list at all, not just unchecked.
  protected readonly resultSources = computed(() =>
    this.sourceResults()
      .filter((result) => !result.error && result.entries.length > 0)
      .map((result) => result.source),
  );

  // Resets to "everything that came back, all checked" on every new fetch, but stays writable in
  // between so unchecking a source in the left column doesn't get fought by this signal.
  protected readonly selectedResultSources = linkedSignal(() => this.resultSources());

  protected isResultSourceSelected(source: string): boolean {
    return this.selectedResultSources().includes(source);
  }

  protected toggleResultSource(source: string, checked: boolean): void {
    this.selectedResultSources.update((sources) =>
      checked ? [...sources, source] : sources.filter((s) => s !== source),
    );
  }

  protected onSearch(): void {
    this.submittedTerm.set(this.searchTerm().trim());
  }

  protected onClearSearch(): void {
    this.searchTerm.set('');
    this.submittedTerm.set('');
  }
}
