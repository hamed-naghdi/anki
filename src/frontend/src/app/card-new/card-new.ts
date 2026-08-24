import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
  WritableSignal,
} from '@angular/core';
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
import { Tree } from 'primeng/tree';
import { TreeSelect } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';
import { Search } from '@primeicons/angular/search';
import { StarFill } from '@primeicons/angular/star-fill';
import { Times } from '@primeicons/angular/times';
import { VolumeUp } from '@primeicons/angular/volume-up';
import { DeckService } from '../core/deck.service';
import { NoteTypeService } from '../core/note-type.service';
import {
  DICTIONARY_SOURCES,
  DictionaryEntry,
  DictionarySearchResult,
  DictionarySourceOption,
  Pronunciation,
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
    Tree,
    TreeSelect,
    FormsModule,
    Search,
    StarFill,
    Times,
    VolumeUp,
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

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // Landing on this page is always to search for a word, so the box should be ready to type
    // into immediately - no click required.
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
  }

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

  // One tree node per entry a dictionary returned (e.g. "free" has several homograph entries in
  // Longman) - the headword and its part of speech are all a node carries for now; the fields
  // within an entry will become its children once field-level checkboxes exist. `data` carries the
  // entry itself so the node template can style the word and part of speech differently.
  //
  // The label uses entry.headword, NOT the searched term - a source can fall back to a related
  // word when the exact search has no entry of its own (e.g. Oxford has no "walk free" entry, so
  // it lands on "free" instead), and labelling that result with the search text would misrepresent
  // what the entry - and its audio/pronunciation - actually are.
  private readonly treeNodesBySource = computed(() => {
    const nodesBySource = new Map<string, TreeNode[]>();

    for (const result of this.sourceResults()) {
      nodesBySource.set(
        result.source,
        result.entries.map((entry, index) => ({
          key: `${result.source}-${index}`,
          label: entry.partOfSpeech ? `${entry.headword} (${entry.partOfSpeech})` : entry.headword,
          data: entry,
        })),
      );
    }

    return nodesBySource;
  });

  protected treeNodesFor(source: string): TreeNode[] {
    return this.treeNodesBySource().get(source) ?? [];
  }

  // The tree node header shows one pronunciation for the whole entry - the base one (no label),
  // not one tied to a specific inflection - so this picks that one out of the list the backend
  // sends (which also includes e.g. "past tense"-labelled pronunciations for irregular verbs).
  protected primaryPronunciation(entry: DictionaryEntry): Pronunciation | null {
    return entry.pronunciations.find((pronunciation) => pronunciation.label === null) ?? entry.pronunciations[0] ?? null;
  }

  // A frequency label is either the 3-dot band ("●●○") or a top-1000 spoken/written badge
  // ("S1"/"W1") - distinguished here since the two render with very different styling.
  protected isFrequencyDots(code: string): boolean {
    return code.includes('●') || code.includes('○');
  }

  // Oxford's CEFR levels (a1/a2/b1/b2/c1/c2) group into three broad bands - color the level badge
  // by band, from beginner (green) to advanced (violet), rather than a distinct shade per level.
  protected cefrLevelClasses(level: string): string {
    switch (level.charAt(0).toLowerCase()) {
      case 'a':
        return 'bg-emerald-600/90 dark:bg-emerald-500/80';
      case 'b':
        return 'bg-sky-600/90 dark:bg-sky-500/80';
      default:
        return 'bg-violet-600/90 dark:bg-violet-500/80';
    }
  }

  protected playAudio(url: string | null | undefined, event: Event): void {
    event.stopPropagation();
    if (url) {
      void new Audio(url).play();
    }
  }

  // Which entries are checked in each dictionary's tree, tracked per side (front/back never share
  // a checkbox state) and reset to "nothing checked" whenever a new search replaces the results.
  // Uses the older `selection` (node-array) model rather than v22's new `selectionKeys` map, which
  // didn't respond to clicks at all in practice.
  private readonly selectionBySide: Record<CardSide, WritableSignal<TreeNode[]>> = {
    front: linkedSignal(() => {
      this.resultSources();
      return [];
    }),
    back: linkedSignal(() => {
      this.resultSources();
      return [];
    }),
  };

  protected selectionFor(side: CardSide): TreeNode[] {
    return this.selectionBySide[side]();
  }

  protected setSelection(side: CardSide, selection: TreeNode[] | null | undefined): void {
    this.selectionBySide[side].set(selection ?? []);
  }

  protected onSearch(): void {
    this.submittedTerm.set(this.searchTerm().trim());
    this.submittedSources.set(this.selectedSources());
    // Results show submittedTerm(), not searchTerm(), so clearing the box here just leaves it
    // ready for the next word - it doesn't affect what's currently on screen.
    this.searchTerm.set('');
  }

  protected onClearSearch(): void {
    this.searchTerm.set('');
    this.submittedTerm.set('');
    this.submittedSources.set([]);
  }
}
