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
import { Editor } from 'primeng/editor';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { Tree } from 'primeng/tree';
import type { TreeNodeDropEvent } from 'primeng/tree';
import { TreeSelect } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';
import { TreeDragDropService } from 'primeng/api';
import { Code } from '@primeicons/angular/code';
import { GripVertical } from '@primeicons/angular/grip-vertical';
import { Key } from '@primeicons/angular/key';
import { Plus } from '@primeicons/angular/plus';
import { Search } from '@primeicons/angular/search';
import { Times } from '@primeicons/angular/times';
import { VolumeUp } from '@primeicons/angular/volume-up';
import { DeckService } from '../core/deck.service';
import { NoteTypeService } from '../core/note-type.service';
import {
  DICTIONARY_SOURCES,
  DictionaryEntry,
  DictionaryExample,
  DictionarySearchResult,
  DictionarySense,
  DictionarySourceOption,
  InflectionForm,
  LANGUAGES,
  LanguageOption,
  PhoneticVariant,
  Pronunciation,
  dictionaryLookupRequest,
} from '../core/dictionary-api';

// Front and back look at the exact same result data, but everything about how a person interacts
// with that data on each side - collapsing an accordion, which fields are checked, and how they're
// ordered onto that side - is tracked independently, so acting on one side must never affect the
// other. Both sides share a single tab (see `activeTab`) so the results tree and its preview can
// never drift out of sync about which side is being edited.
type CardSide = 'front' | 'back';

// The selectable pieces of a single entry - each becomes its own checkbox leaf under the entry's
// tree node, so checking/unchecking the entry (the "header") checks/unchecks all of them via
// PrimeNG's built-in checkbox parent/child propagation, and vice versa. `inflectionForm` is one
// specific form (e.g. "plural: wives"), not the whole inflectionForms list - that list is instead a
// pure grouping node (EntryFieldGroup below) so each form can be selected independently. The
// `sense*` kinds and `example` work the same way, one level deeper (per sense, then per example).
type EntryFieldKind =
  | 'headword'
  | 'partOfSpeech'
  | 'homographNumber'
  | 'pronunciation-british'
  | 'pronunciation-american'
  | 'keyword'
  | 'frequencyLabels'
  | 'inflectionForm'
  | 'senseDefinition'
  | 'senseGrammar'
  | 'senseRegister'
  | 'senseSynonyms'
  | 'senseAntonyms'
  | 'example';

// "Longman:Entry 2:Pronunciation (UK)" when a source returned more than one entry for the search
// (homographs, or several parts of speech), otherwise just "Longman:Pronunciation (UK)" - with only
// one entry, the source name alone is unambiguous and the "Entry 1" would be pure noise.
function buildPath(sourceLabel: string, entryOrdinal: number, entryCount: number, label: string): string {
  const entryPart = entryCount > 1 ? `${sourceLabel}:Entry ${entryOrdinal}` : sourceLabel;
  return `${entryPart}:${label}`;
}

interface EntryFieldData {
  kind: EntryFieldKind;
  label: string;
  entry: DictionaryEntry;
  entryKey: string;
  sourceLabel: string;
  entryOrdinal: number;
  entryCount: number;
  // Only set for kind 'inflectionForm' - which of entry.inflectionForms this leaf is.
  formIndex?: number;
  // Set for every sense-scoped kind (senseDefinition/senseGrammar/senseRegister/senseSynonyms/
  // senseAntonyms/example) - which of entry.senses this leaf belongs to.
  senseIndex?: number;
  // Only set for kind 'example' - which of that sense's examples this leaf is.
  exampleIndex?: number;
}

// A purely organizational tree node (e.g. "Inflection forms") that groups several selectable
// leaves under one checkbox for bulk (de)select in the RESULTS tree - not to be confused with the
// rendered PlacedField groups below, which group the same leaves for ordering/preview purposes.
interface EntryFieldGroup {
  isGroup: true;
  label: string;
}

// A free-form rich-text block the user authors directly, rather than one derived from a dictionary
// entry - works like any other placed field otherwise (draggable between groups, duplicable,
// removable), and there can be any number of instances. `viewMode` toggles between the WYSIWYG
// Quill editor and a raw-HTML textarea, mirroring Anki's own note editor's HTML-source toggle.
//
// `html`/`viewMode` are their OWN signals, not plain values on an object that lives inside
// orderBySide - editing either only needs to update this one signal, not rebuild the whole order
// tree. Rebuilding the tree on every keystroke was the original approach, and it replaces the
// [value] array bound to the reorder p-tree on every keystroke, which tears down and recreates the
// editor's DOM (and Quill instance) each time, stealing focus after every character typed.
interface RichTextFieldData {
  kind: 'richText';
  html: WritableSignal<string>;
  viewMode: WritableSignal<'rich' | 'html'>;
}

// What a placed field's `field` can hold - dictionary-derived data, or a user-authored rich-text
// block. Every place that renders/labels a PlacedField switches on `.kind`, which discriminates the
// two cleanly since 'richText' never appears in EntryFieldKind.
type PlacedFieldData = EntryFieldData | RichTextFieldData;

// One placed field inside a side's ordered groups. `instanceKey` is this placement's own identity
// (a results-tree leaf key for an original, a synthesized `-copy-N` key for a duplicate, or a
// synthesized id for a fresh rich-text block) - that's what drag-drop and removal operate on.
// `field` is the underlying value to render, which an original and any of its copies all share
// (a rich-text copy gets its own signals instead - see duplicateField). Group membership is NOT
// tracked here - it's purely structural (whichever order-tree group node's `children` array this
// leaf currently sits in), since the user is free to drag any field, original or copy, into any
// group at any time.
interface PlacedField {
  instanceKey: string;
  field: PlacedFieldData;
  isCopy: boolean;
}

// A group node in a side's order tree - a free-form container the user builds by hand (drag fields
// in and out, drag the group itself to reorder), not tied to any one entry or dictionary. The only
// structural rules are that a group can hold at most one headword, and inflection forms - once
// placed - can never leave whichever single group they're in (both enforced in onOrderTreeDrop).
interface OrderGroupData {
  isGroup: true;
}

@Component({
  imports: [
    Accordion,
    AccordionContent,
    AccordionHeader,
    AccordionPanel,
    ButtonDirective,
    Checkbox,
    Editor,
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
    Code,
    GripVertical,
    Key,
    Plus,
    Search,
    Times,
    VolumeUp,
  ],
  selector: 'app-card-new',
  styles: ``,
  templateUrl: './card-new.html',
  // p-tree's draggableNodes/droppableNodes silently no-op (actually throw internally, since it
  // calls straight into it with no null-check) without a TreeDragDropService in scope - PrimeNG
  // treats it as optional-but-required-for-DnD, so the reorder tree needs it provided here.
  providers: [TreeDragDropService],
})
export class CardNew {
  // Decks and note types come directly from Anki via AnkiConnect (no backend involvement).
  protected readonly deckService = inject(DeckService);
  protected readonly noteTypeService = inject(NoteTypeService);

  protected readonly languages: LanguageOption[] = [...LANGUAGES];

  protected readonly selectedLanguage = signal('en');

  // Only the sources belonging to whichever language is picked - today that's always both English
  // dictionaries, but this is what lets a future German source (once one exists) not show up while
  // English is selected, and vice versa.
  protected readonly availableSources = computed((): DictionarySourceOption[] =>
    DICTIONARY_SOURCES.filter((source) => source.language === this.selectedLanguage()),
  );

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // Landing on this page is always to search for a word, so the box should be ready to type
    // into immediately - no click required.
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
  }

  searchTerm = signal('');

  // Resets to "everything the current language offers, all checked" whenever the language changes,
  // but stays writable in between so unchecking a source in the dropdown doesn't get fought by this
  // signal.
  protected readonly selectedSources = linkedSignal(() => this.availableSources().map((source) => source.key));

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

  // The one Front/Back tab governing both the results tree AND its preview together - they used to
  // have independent tabs, which let them drift out of sync (e.g. results showing Back while the
  // preview still showed Front); a single tab makes that impossible.
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
  // Longman), with one checkbox child per field that entry actually has - `data` on the entry node
  // itself stays the entry, so the node template can still style the word and part of speech
  // differently there, while each child's `data` is an EntryFieldData discriminated by `kind`.
  //
  // The label uses entry.headword, NOT the searched term - a source can fall back to a related
  // word when the exact search has no entry of its own (e.g. Oxford has no "walk free" entry, so
  // it lands on "free" instead), and labelling that result with the search text would misrepresent
  // what the entry - and its audio/pronunciation - actually are.
  private readonly treeNodesBySource = computed(() => {
    const nodesBySource = new Map<string, TreeNode[]>();

    for (const result of this.sourceResults()) {
      const entryCount = result.entries.length;

      nodesBySource.set(
        result.source,
        result.entries.map((entry, index) => {
          const key = `${result.source}-${index}`;
          return {
            key,
            label: entry.partOfSpeech ? `${entry.headword} (${entry.partOfSpeech})` : entry.headword,
            data: entry,
            children: this.entryFieldNodes(key, entry, result.source, index + 1, entryCount),
          };
        }),
      );
    }

    return nodesBySource;
  });

  protected treeNodesFor(source: string): TreeNode[] {
    return this.treeNodesBySource().get(source) ?? [];
  }

  private entryFieldNodes(
    entryKey: string,
    entry: DictionaryEntry,
    sourceLabel: string,
    entryOrdinal: number,
    entryCount: number,
  ): TreeNode[] {
    const field = (
      kind: EntryFieldKind,
      label: string,
      extra?: Pick<EntryFieldData, 'formIndex' | 'senseIndex' | 'exampleIndex'>,
    ): TreeNode => {
      const key =
        extra?.exampleIndex !== undefined
          ? `${entryKey}-sense-${extra.senseIndex}-example-${extra.exampleIndex}`
          : extra?.senseIndex !== undefined
            ? `${entryKey}-sense-${extra.senseIndex}-${kind}`
            : extra?.formIndex !== undefined
              ? `${entryKey}-inflection-${extra.formIndex}`
              : `${entryKey}-${kind}`;
      return {
        key,
        label,
        data: { kind, label, entry, entryKey, sourceLabel, entryOrdinal, entryCount, ...extra } satisfies EntryFieldData,
      };
    };

    // This order is what determines the order fields land in when the user checks the whole entry
    // at once (PrimeNG's checkbox propagation walks children in this array's order) - keyword,
    // headword, homograph number, part of speech, UK then US pronunciation, frequency, matching the
    // real card design's field order regardless of which of these a given source actually has.
    const nodes: TreeNode[] = [];

    if (entry.isKeyword || entry.keywordLevel) {
      nodes.push(field('keyword', 'Keyword & level'));
    }
    nodes.push(field('headword', 'Headword'));
    if (entry.homographNumber) {
      nodes.push(field('homographNumber', 'Homograph number'));
    }
    if (entry.partOfSpeech) {
      nodes.push(field('partOfSpeech', 'Part of speech'));
    }
    if (this.britishPhonetic(entry)) {
      nodes.push(field('pronunciation-british', 'Pronunciation (UK)'));
    }
    if (this.americanPhonetic(entry)) {
      nodes.push(field('pronunciation-american', 'Pronunciation (US)'));
    }
    if (entry.frequencyLabels?.length) {
      nodes.push(field('frequencyLabels', 'Frequency'));
    }

    if (entry.inflectionForms.length) {
      // A group, not a leaf: checking it (de)selects every form at once via checkbox propagation,
      // but each form is also independently selectable - Oxford in particular can carry several
      // (comparative, superlative, 3rd person singular, -ing form, ...), each with its own accents.
      nodes.push({
        key: `${entryKey}-inflectionForms`,
        label: 'Inflection forms',
        data: { isGroup: true, label: 'Inflection forms' } satisfies EntryFieldGroup,
        children: entry.inflectionForms.map((form, formIndex) =>
          field('inflectionForm', form.label ?? 'Inflection form', { formIndex }),
        ),
      });
    }

    // One group per sense (not one big "Senses" wrapper) - mirrors how a dictionary site lists
    // meanings as separate numbered entries, and lets a single sense be bulk-selected on its own.
    // Order within a sense mirrors that site convention too: grammar/register tag, definition,
    // synonyms/antonyms, then a nested Examples group (each example independently selectable, same
    // reasoning as inflection forms).
    entry.senses.forEach((sense, senseIndex) => {
      const senseChildren: TreeNode[] = [];
      if (sense.grammar) {
        senseChildren.push(field('senseGrammar', 'Grammar', { senseIndex }));
      }
      if (sense.register) {
        senseChildren.push(field('senseRegister', 'Register', { senseIndex }));
      }
      if (sense.definition) {
        senseChildren.push(field('senseDefinition', 'Definition', { senseIndex }));
      }
      if (sense.synonyms.length) {
        senseChildren.push(field('senseSynonyms', 'Synonyms', { senseIndex }));
      }
      if (sense.antonyms.length) {
        senseChildren.push(field('senseAntonyms', 'Antonyms', { senseIndex }));
      }
      if (sense.examples.length) {
        senseChildren.push({
          key: `${entryKey}-sense-${senseIndex}-examples`,
          label: 'Examples',
          data: { isGroup: true, label: 'Examples' } satisfies EntryFieldGroup,
          children: sense.examples.map((_, exampleIndex) =>
            field('example', `Example ${exampleIndex + 1}`, { senseIndex, exampleIndex }),
          ),
        });
      }
      if (senseChildren.length) {
        const label = this.senseLabel(sense, senseIndex);
        nodes.push({
          key: `${entryKey}-sense-${senseIndex}`,
          label,
          data: { isGroup: true, label } satisfies EntryFieldGroup,
          children: senseChildren,
        });
      }
    });

    return nodes;
  }

  // "1. to get something by paying money for it" for a sense's group label in the results tree -
  // falls back to a plain ordinal when a sense has no definition text (rare, but some providers
  // return grammar/examples-only sub-entries).
  private senseLabel(sense: DictionarySense, senseIndex: number): string {
    const snippet = sense.definition ? this.truncate(sense.definition, 48) : null;
    return snippet ? `${senseIndex + 1}. ${snippet}` : `Sense ${senseIndex + 1}`;
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  // The tree node header shows one pronunciation for the whole entry - the base one (no label),
  // not one tied to a specific inflection - so this picks that one out of the list the backend
  // sends (which also includes e.g. "past tense"-labelled pronunciations for irregular verbs).
  protected primaryPronunciation(entry: DictionaryEntry): Pronunciation | null {
    return entry.pronunciations.find((pronunciation) => pronunciation.label === null) ?? entry.pronunciations[0] ?? null;
  }

  protected britishPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
    return this.primaryPronunciation(entry)?.british[0] ?? null;
  }

  protected americanPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
    return this.primaryPronunciation(entry)?.american[0] ?? null;
  }

  protected inflectionFormFor(field: EntryFieldData): InflectionForm | null {
    return field.formIndex !== undefined ? (field.entry.inflectionForms[field.formIndex] ?? null) : null;
  }

  protected senseFor(field: EntryFieldData): DictionarySense | null {
    return field.senseIndex !== undefined ? (field.entry.senses[field.senseIndex] ?? null) : null;
  }

  protected exampleFor(field: EntryFieldData): DictionaryExample | null {
    if (field.exampleIndex === undefined) {
      return null;
    }
    return this.senseFor(field)?.examples[field.exampleIndex] ?? null;
  }

  // Longman regularly prints IPA without its enclosing slashes (e.g. "friː" instead of "/friː/"),
  // while Oxford always includes them - normalize both to the same "/.../ " convention rather than
  // showing the discrepancy to the user.
  protected formatIpa(ipa: string): string {
    const inner = ipa.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return inner ? `/${inner}/` : '';
  }

  // Plain-text summary of a field's value for the compact reorder-list rows - the card preview and
  // the results tree render each kind with their own richer layout (audio buttons, badges, etc.).
  protected fieldValueText(field: PlacedFieldData): string {
    switch (field.kind) {
      case 'richText':
        return field
          .html()
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      case 'headword':
        return field.entry.headword;
      case 'partOfSpeech':
        return field.entry.partOfSpeech ?? '';
      case 'homographNumber':
        return field.entry.homographNumber ?? '';
      case 'pronunciation-british': {
        const uk = this.britishPhonetic(field.entry);
        return uk ? this.formatIpa(uk.ipa) : '';
      }
      case 'pronunciation-american': {
        const us = this.americanPhonetic(field.entry);
        return us ? this.formatIpa(us.ipa) : '';
      }
      case 'keyword':
        return [field.entry.isKeyword ? 'keyword' : null, field.entry.keywordLevel?.toUpperCase() ?? null]
          .filter((part): part is string => !!part)
          .join(' · ');
      case 'frequencyLabels':
        return (field.entry.frequencyLabels ?? []).map((label) => label.code).join(' ');
      case 'inflectionForm':
        return field.formIndex !== undefined ? (field.entry.inflectionForms[field.formIndex]?.form ?? '') : '';
      case 'senseDefinition':
        return this.senseFor(field)?.definition ?? '';
      case 'senseGrammar':
        return this.senseFor(field)?.grammar ?? '';
      case 'senseRegister':
        return this.senseFor(field)?.register ?? '';
      case 'senseSynonyms':
        return (this.senseFor(field)?.synonyms ?? []).join(', ');
      case 'senseAntonyms':
        return (this.senseFor(field)?.antonyms ?? []).join(', ');
      case 'example':
        return (this.exampleFor(field)?.segments ?? []).map((segment) => segment.text).join('');
    }
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

  // Every checkable leaf across all sources, keyed by its tree node key and resolved back to its
  // field data - lets a side's ordered group list (which only stores keys) look up what to render
  // without walking the results tree again, and lets `setSelection` tell a real content leaf apart
  // from a purely organizational group/entry node that also happens to appear in a selection.
  private readonly entryFieldsByKey = computed(() => {
    const map = new Map<string, EntryFieldData>();

    const visit = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        const data = node.data as EntryFieldData | EntryFieldGroup | undefined;
        if (data && 'isGroup' in data && data.isGroup) {
          visit(node.children ?? []);
        } else if (data && 'kind' in data) {
          map.set(node.key!, data);
        }
      }
    };

    for (const nodes of this.treeNodesBySource().values()) {
      for (const entryNode of nodes) {
        visit(entryNode.children ?? []);
      }
    }

    return map;
  });

  protected setSelection(side: CardSide, selection: TreeNode[] | null | undefined): void {
    const nodes = selection ?? [];
    this.selectionBySide[side].set(nodes);

    // Checking a group or an entire entry adds every one of its descendant leaves to `nodes` too
    // (PrimeNG's own checkbox propagation), so filtering to keys this map recognizes is enough to
    // land on exactly the real, orderable content leaves - regardless of which level was clicked.
    const fieldsByKey = this.entryFieldsByKey();
    const checkedKeys = new Set(nodes.map((node) => node.key!).filter((key) => fieldsByKey.has(key)));

    this.orderBySide[side].update((groups) => this.reconcileOrderTree(groups, checkedKeys, fieldsByKey));
  }

  // A side's order tree: a flat list of free-form groups, each holding whichever fields the user
  // put there. Starts as "each newly checked leaf appends into its own entry's default group" but
  // is then entirely up to the user via drag - both which group a field lives in, and the order of
  // groups and of fields within a group. The only rule the user can't override is one headword per
  // group (enforced in isValidOrderDrop, since it's checked at drop time, not stored here).
  private readonly orderBySide: Record<CardSide, WritableSignal<TreeNode[]>> = {
    front: linkedSignal(() => {
      this.resultSources();
      return [];
    }),
    back: linkedSignal(() => {
      this.resultSources();
      return [];
    }),
  };

  private nextCopyId = 0;

  protected orderGroupsFor(side: CardSide): TreeNode[] {
    return this.orderBySide[side]();
  }

  protected groupFieldsFor(group: TreeNode): PlacedField[] {
    return (group.children ?? []).map((child) => child.data as PlacedField);
  }

  // Prose-like kinds that read badly wrapped inline with badges/tags in the preview - each gets its
  // own line instead (see stackedFieldsFor). Short tag-like kinds (badges, grammar/register tags,
  // SYN/OPP) still wrap inline together in inlineFieldsFor.
  private static readonly STACKED_FIELD_KINDS: ReadonlySet<PlacedFieldData['kind']> = new Set<PlacedFieldData['kind']>([
    'inflectionForm',
    'senseDefinition',
    'example',
    'richText',
  ]);

  protected inlineFieldsFor(group: TreeNode): PlacedField[] {
    return this.groupFieldsFor(group).filter((placed) => !CardNew.STACKED_FIELD_KINDS.has(placed.field.kind));
  }

  protected stackedFieldsFor(group: TreeNode): PlacedField[] {
    return this.groupFieldsFor(group).filter((placed) => CardNew.STACKED_FIELD_KINDS.has(placed.field.kind));
  }

  // Only inflection forms get the extra left gap - definitions/examples stack one-per-line too
  // (see stackedFieldsFor) but without the indent, since that was specifically meant to set an
  // inflections block apart from the header row above it.
  protected isInflectionGroup(group: TreeNode): boolean {
    return this.groupFieldsFor(group).some((placed) => placed.field.kind === 'inflectionForm');
  }

  // The reorder list's label for a group - the headword (and part of speech) of whichever field in
  // it is a headword; failing that, "<dictionary>: Inflection forms" for a group of inflection
  // forms (their default group is per-dictionary - see reconcileOrderTree); failing that, a sense's
  // own definition snippet for a group of sense-scoped fields (their default group is per-sense);
  // failing that, a plain fallback (any other mix of fields is still a valid group - see OrderGroupData).
  protected groupLabelFor(side: CardSide, group: TreeNode): string {
    const fields = this.groupFieldsFor(group);
    const headword = fields.find((placed) => placed.field.kind === 'headword');
    if (headword) {
      const entry = (headword.field as EntryFieldData).entry;
      return entry.partOfSpeech ? `${entry.headword} (${entry.partOfSpeech})` : entry.headword;
    }
    const inflection = fields.find((placed) => placed.field.kind === 'inflectionForm');
    if (inflection) {
      const field = inflection.field as EntryFieldData;
      return buildPath(field.sourceLabel, field.entryOrdinal, field.entryCount, 'Inflection forms');
    }
    const senseField = fields.find((placed) => (placed.field as EntryFieldData).senseIndex !== undefined);
    if (senseField) {
      const field = senseField.field as EntryFieldData;
      const sense = this.senseFor(field);
      const label = sense ? this.senseLabel(sense, field.senseIndex!) : 'Sense';
      return buildPath(field.sourceLabel, field.entryOrdinal, field.entryCount, label);
    }
    if (fields.some((placed) => placed.field.kind === 'richText')) {
      return 'Custom text';
    }
    const index = this.orderBySide[side]().indexOf(group);
    return `Group ${index + 1}`;
  }

  protected fieldPathLabel(field: PlacedFieldData): string {
    if (field.kind === 'richText') {
      return 'Custom text';
    }
    return buildPath(field.sourceLabel, field.entryOrdinal, field.entryCount, field.label);
  }

  private isGroupNode(node: TreeNode): boolean {
    return !!(node.data as OrderGroupData | undefined)?.isGroup;
  }

  // Rebuilds a side's order tree from a target set of checked results-tree leaves: copies are left
  // exactly where they are (they aren't tied to any checkbox); an existing original leaf is kept in
  // whichever group it currently sits in (the user may have dragged it) as long as it's still
  // checked, and dropped otherwise; a newly checked leaf that isn't anywhere yet is appended into a
  // default group - its own entry's group for anything else, but its own DICTIONARY's shared
  // inflections group for inflection forms (grouped by source, not by entry, so two homographs from
  // the same dictionary still share one inflections group, but different dictionaries never do) -
  // once there, an inflection form can never be dragged into a different group (wouldLeaveInflectionGroup).
  private reconcileOrderTree(
    existingGroups: TreeNode[],
    checkedKeys: ReadonlySet<string>,
    fieldsByKey: ReadonlyMap<string, EntryFieldData>,
  ): TreeNode[] {
    const nextGroups: TreeNode[] = [];
    const seenOriginalKeys = new Set<string>();

    for (const group of existingGroups) {
      const keptChildren = (group.children ?? []).filter((child) => {
        const placed = child.data as PlacedField;
        if (placed.isCopy) {
          return true;
        }
        const stillChecked = checkedKeys.has(placed.instanceKey);
        if (stillChecked) {
          seenOriginalKeys.add(placed.instanceKey);
        }
        return stillChecked;
      });
      if (keptChildren.length > 0) {
        nextGroups.push({ ...group, children: keptChildren });
      }
    }

    const additionsByGroupKey = new Map<string, TreeNode[]>();
    for (const key of checkedKeys) {
      if (seenOriginalKeys.has(key)) {
        continue;
      }
      const field = fieldsByKey.get(key)!;
      const placed: PlacedField = { instanceKey: key, field, isCopy: false };
      const child: TreeNode = { key, data: placed };
      const groupKey =
        field.kind === 'inflectionForm'
          ? `group-inflections-${field.sourceLabel}`
          : field.senseIndex !== undefined
            ? `group-sense-${field.entryKey}-${field.senseIndex}`
            : `group-${field.entryKey}`;
      const list = additionsByGroupKey.get(groupKey);
      if (list) {
        list.push(child);
      } else {
        additionsByGroupKey.set(groupKey, [child]);
      }
    }

    for (const [groupKey, newChildren] of additionsByGroupKey) {
      const existingGroup = nextGroups.find((group) => group.key === groupKey);
      if (existingGroup) {
        existingGroup.children = [...(existingGroup.children ?? []), ...newChildren];
      } else {
        nextGroups.push({ key: groupKey, data: { isGroup: true } satisfies OrderGroupData, children: newChildren });
      }
    }

    return nextGroups;
  }

  // Recomputes which tree nodes PrimeNG should show as checked (every leaf in checkedLeafKeys, plus
  // any group/entry whose every descendant ended up checked) and each group/entry's indeterminate
  // state, then writes the result back as the side's tree selection. Only needed when an original is
  // removed from OUTSIDE the tree (the reorder list's remove buttons) - a tree click keeps its own
  // selection/indeterminate bookkeeping in sync on its own.
  private recomputeTreeSelection(side: CardSide, checkedLeafKeys: ReadonlySet<string>): void {
    const selected: TreeNode[] = [];

    const visit = (node: TreeNode): boolean => {
      if (!node.children || node.children.length === 0) {
        const isChecked = checkedLeafKeys.has(node.key!);
        if (isChecked) {
          selected.push(node);
        }
        node.partialSelected = false;
        return isChecked;
      }

      const childStates = node.children.map(visit);
      const allChecked = childStates.every(Boolean);
      const someChecked = childStates.some(Boolean);

      node.partialSelected = someChecked && !allChecked;
      if (allChecked) {
        selected.push(node);
      }
      return allChecked;
    };

    for (const nodes of this.treeNodesBySource().values()) {
      for (const entryNode of nodes) {
        visit(entryNode);
      }
    }

    this.selectionBySide[side].set(selected);
  }

  private originalKeysFor(side: CardSide): Set<string> {
    const keys = new Set<string>();
    for (const group of this.orderBySide[side]()) {
      for (const child of group.children ?? []) {
        const placed = child.data as PlacedField;
        if (!placed.isCopy) {
          keys.add(placed.instanceKey);
        }
      }
    }
    return keys;
  }

  protected removeField(side: CardSide, instanceKey: string): void {
    let removed: PlacedField | undefined;
    this.orderBySide[side].update((groups) =>
      groups
        .map((group) => {
          const children = (group.children ?? []).filter((child) => {
            const placed = child.data as PlacedField;
            const isMatch = placed.instanceKey === instanceKey;
            if (isMatch) {
              removed = placed;
            }
            return !isMatch;
          });
          return { ...group, children };
        })
        .filter((group) => (group.children?.length ?? 0) > 0),
    );
    if (removed && !removed.isCopy) {
      this.recomputeTreeSelection(side, this.originalKeysFor(side));
    }
  }

  protected removeGroup(side: CardSide, group: TreeNode): void {
    this.orderBySide[side].update((groups) => groups.filter((candidate) => candidate !== group));
    this.recomputeTreeSelection(side, this.originalKeysFor(side));
  }

  // Duplicates a placed field in place (right after the original, in the same group) as a new,
  // independent copy - the user then drags the copy wherever they want, including into another
  // group. Headwords are exempt: a group can only ever have the one it was formed around, so a
  // duplicate would just be an invalid drop everywhere else.
  protected duplicateField(side: CardSide, instanceKey: string): void {
    if (this.entryFieldsByKey().get(instanceKey)?.kind === 'headword') {
      return;
    }
    this.orderBySide[side].update((groups) =>
      groups.map((group) => {
        const children = group.children ?? [];
        const index = children.findIndex((child) => child.key === instanceKey);
        if (index === -1) {
          return group;
        }
        const source = children[index].data as PlacedField;
        if (source.field.kind === 'headword') {
          return group;
        }
        const copyKey = `${instanceKey}-copy-${this.nextCopyId++}`;
        // A rich-text field's copy needs its own signals - sharing the source's would mean editing
        // either instance edits both (they're the same live html()/viewMode() underneath).
        const copiedField: PlacedFieldData =
          source.field.kind === 'richText'
            ? ({ kind: 'richText', html: signal(source.field.html()), viewMode: signal(source.field.viewMode()) } satisfies RichTextFieldData)
            : source.field;
        const copy: TreeNode = { key: copyKey, data: { instanceKey: copyKey, field: copiedField, isCopy: true } satisfies PlacedField };
        const nextChildren = [...children];
        nextChildren.splice(index + 1, 0, copy);
        return { ...group, children: nextChildren };
      }),
    );
  }

  // Adds a brand-new rich-text block in its own new group (not tied to any entry, so it has no
  // sensible default group to join) - the user drags it into an existing group afterwards if they
  // want it alongside other fields. Any number of these can exist side by side.
  protected addRichTextBlock(side: CardSide): void {
    const instanceKey = `richtext-${this.nextCopyId++}`;
    const placed: PlacedField = {
      instanceKey,
      field: { kind: 'richText', html: signal(''), viewMode: signal('rich') } satisfies RichTextFieldData,
      isCopy: false,
    };
    const group: TreeNode = {
      key: `group-${instanceKey}`,
      data: { isGroup: true } satisfies OrderGroupData,
      children: [{ key: instanceKey, data: placed }],
    };
    this.orderBySide[side].update((groups) => [...groups, group]);
  }

  // Both write straight into the field's own signal - no need to touch orderBySide at all, which is
  // exactly the point (see the class comment on RichTextFieldData for why that matters for focus).
  protected onRichTextHtmlChange(field: RichTextFieldData, html: string): void {
    field.html.set(html);
  }

  protected toggleRichTextViewMode(field: RichTextFieldData): void {
    field.viewMode.update((mode) => (mode === 'rich' ? 'html' : 'rich'));
  }

  // Whether the field currently being dragged is a headword and the target group already has a
  // different one - the one placement rule the user can't override by hand.
  private wouldConflictOnHeadword(dragNode: TreeNode, group: TreeNode): boolean {
    const dragField = (dragNode.data as PlacedField).field;
    if (dragField.kind !== 'headword') {
      return false;
    }
    return (group.children ?? []).some(
      (child) => child !== dragNode && (child.data as PlacedField).field.kind === 'headword',
    );
  }

  private ownerGroup(side: CardSide, leafNode: TreeNode): TreeNode | undefined {
    return this.orderBySide[side]().find((group) => (group.children ?? []).includes(leafNode));
  }

  // Whether dragging this field would move an inflection form out of the single group inflections
  // are always kept in - true for any inflection form being dropped anywhere but back into its own
  // current group, since they're never allowed to split across two groups.
  private wouldLeaveInflectionGroup(side: CardSide, dragNode: TreeNode, targetGroup: TreeNode): boolean {
    const dragField = (dragNode.data as PlacedField).field;
    if (dragField.kind !== 'inflectionForm') {
      return false;
    }
    return this.ownerGroup(side, dragNode) !== targetGroup;
  }

  // Vets every drag before PrimeNG applies it (the tree's [validateDrop]="true" routes drops
  // through here instead of auto-applying them): groups may only reorder among themselves at the
  // top level (never nest inside another group), a field may only join a group by dropping directly
  // onto its header or between two of its existing fields (never nest inside another field, which
  // is what PrimeNG's default reparenting would otherwise do), no drop may give a group a second
  // headword, and an inflection form may only ever be reordered within its own group, never moved
  // into a different one.
  protected onOrderTreeDrop(side: CardSide, event: TreeNodeDropEvent): void {
    if (!event.dragNode || !event.dropNode || !event.accept) {
      return;
    }
    const dragNode = event.dragNode;
    const dropNode = event.dropNode;
    const dragIsGroup = this.isGroupNode(dragNode);
    const dropIsGroup = this.isGroupNode(dropNode);

    let valid: boolean;
    if (dragIsGroup) {
      valid = event.dropPoint === 'between' && dropIsGroup;
    } else if (event.dropPoint === 'node') {
      valid =
        dropIsGroup &&
        !this.wouldConflictOnHeadword(dragNode, dropNode) &&
        !this.wouldLeaveInflectionGroup(side, dragNode, dropNode);
    } else {
      const targetGroup = dropIsGroup ? undefined : this.ownerGroup(side, dropNode);
      valid =
        !!targetGroup &&
        !this.wouldConflictOnHeadword(dragNode, targetGroup) &&
        !this.wouldLeaveInflectionGroup(side, dragNode, targetGroup);
    }

    if (!valid) {
      return;
    }
    event.accept();
    // PrimeNG mutates the bound array in place (splices dragNode out of its old parent's children
    // and into the new one) - republish a fresh top-level reference so change detection re-renders,
    // and drop any group the move left with zero fields.
    this.orderBySide[side].update((groups) => groups.filter((group) => (group.children?.length ?? 0) > 0));
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
