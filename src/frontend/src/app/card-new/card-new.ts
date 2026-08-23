import { Component, computed, inject, linkedSignal, signal, WritableSignal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Accordion, AccordionContent, AccordionHeader, AccordionPanel } from 'primeng/accordion';
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
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

// Front and back look at the exact same result data, but everything about how a person interacts
// with that data on each side - collapsing an accordion, and soon which fields are checked onto
// that side - is tracked independently, so acting on one side must never affect the other.
type CardSide = 'front' | 'back';

@Component({
  imports: [
    Accordion,
    AccordionContent,
    AccordionHeader,
    AccordionPanel,
    ButtonDirective,
    Checkbox,
    IconField,
    InputIcon,
    InputText,
    NgTemplateOutlet,
    ReactiveFormsModule,
    Select,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
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

  // Separate from searchTerm/selectedSources so a query only fires on Enter - toggling sources in
  // the dropdown must not by itself trigger a new backend request.
  protected readonly submittedTerm = signal('');
  protected readonly submittedSources = signal<string[]>([]);

  protected readonly searchResource = httpResource<DictionarySearchResult>(() => {
    const word = this.submittedTerm();
    const sources = this.submittedSources();
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

  protected readonly activeTab = signal<CardSide>('front');

  // Which of the result accordions are open, tracked per side. Each resets to "everything with a
  // checkbox available, all expanded" on every new fetch, but stays writable in between - and
  // collapsing a panel on one side must never touch the other side's own signal.
  private readonly expandedResultSourcesBySide: Record<CardSide, WritableSignal<string[]>> = {
    front: linkedSignal(() => this.resultSources()),
    back: linkedSignal(() => this.resultSources()),
  };

  // Only sources whose checkbox is currently checked get an accordion at all.
  protected readonly visibleResultSources = computed(() =>
    this.resultSources().filter((source) => this.isResultSourceSelected(source)),
  );

  protected expandedResultSourcesFor(side: CardSide): string[] {
    return this.expandedResultSourcesBySide[side]();
  }

  protected isAllExpanded(side: CardSide): boolean {
    const expanded = this.expandedResultSourcesBySide[side]();
    return this.visibleResultSources().every((source) => expanded.includes(source));
  }

  protected toggleExpandAll(side: CardSide): void {
    this.expandedResultSourcesBySide[side].set(this.isAllExpanded(side) ? [] : [...this.visibleResultSources()]);
  }

  protected onExpandedResultSourcesChange(
    side: CardSide,
    value: string | number | (string | number)[] | null | undefined,
  ): void {
    this.expandedResultSourcesBySide[side].set(
      Array.isArray(value) ? value.map(String) : value === null || value === undefined ? [] : [String(value)],
    );
  }

  protected onSearch(): void {
    this.submittedTerm.set(this.searchTerm().trim());
    this.submittedSources.set(this.selectedSources());
  }

  protected onClearSearch(): void {
    this.searchTerm.set('');
    this.submittedTerm.set('');
    this.submittedSources.set([]);
  }
}
