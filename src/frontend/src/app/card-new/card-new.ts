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
import type { TreeNodeDropEvent } from 'primeng/tree';
import { TreeSelect } from 'primeng/treeselect';
import type { TreeNode } from 'primeng/api';
import { TreeDragDropService } from 'primeng/api';
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
  DictionarySearchResult,
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
// pure grouping node (EntryFieldGroup below) so each form can be selected independently.
type EntryFieldKind =
  | 'headword'
  | 'partOfSpeech'
  | 'homographNumber'
  | 'pronunciation-british'
  | 'pronunciation-american'
  | 'keyword'
  | 'frequencyLabels'
  | 'inflectionForm';

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
}

// A purely organizational tree node (e.g. "Inflection forms") that groups several selectable
// leaves under one checkbox for bulk (de)select in the RESULTS tree - not to be confused with the
// rendered PlacedField groups below, which group the same leaves for ordering/preview purposes.
interface EntryFieldGroup {
  isGroup: true;
  label: string;
}

// One placed field inside a side's ordered groups. `instanceKey` is this placement's own identity
// (a results-tree leaf key for an original, or a synthesized `-copy-N` key for a duplicate) - that's
// what drag-drop and removal operate on. `field` is the underlying value to render, which an
// original and any of its copies all share. Group membership is NOT tracked here - it's purely
// structural (whichever order-tree group node's `children` array this leaf currently sits in),
// since the user is free to drag any field, original or copy, into any group at any time.
interface PlacedField {
  instanceKey: string;
  field: EntryFieldData;
  isCopy: boolean;
}

// A group node in a side's order tree - a free-form container the user builds by hand (drag fields
// in and out, drag the group itself to reorder), not tied to any one entry or dictionary. The only
// structural rule is that a group can hold at most one headword (enforced in isValidOrderDrop).
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
    const field = (kind: EntryFieldKind, label: string, formIndex?: number): TreeNode => ({
      key: formIndex !== undefined ? `${entryKey}-inflection-${formIndex}` : `${entryKey}-${kind}`,
      label,
      data: { kind, label, entry, entryKey, sourceLabel, entryOrdinal, entryCount, formIndex } satisfies EntryFieldData,
    });

    const nodes: TreeNode[] = [field('headword', 'Headword')];

    if (entry.partOfSpeech) {
      nodes.push(field('partOfSpeech', 'Part of speech'));
    }
    if (entry.homographNumber) {
      nodes.push(field('homographNumber', 'Homograph number'));
    }
    if (this.britishPhonetic(entry)) {
      nodes.push(field('pronunciation-british', 'Pronunciation (UK)'));
    }
    if (this.americanPhonetic(entry)) {
      nodes.push(field('pronunciation-american', 'Pronunciation (US)'));
    }
    if (entry.isKeyword || entry.keywordLevel) {
      nodes.push(field('keyword', 'Keyword & level'));
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
          field('inflectionForm', form.label ? `${form.label}: ${form.form}` : form.form, formIndex),
        ),
      });
    }

    return nodes;
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

  // Longman regularly prints IPA without its enclosing slashes (e.g. "friː" instead of "/friː/"),
  // while Oxford always includes them - normalize both to the same "/.../ " convention rather than
  // showing the discrepancy to the user.
  protected formatIpa(ipa: string): string {
    const inner = ipa.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return inner ? `/${inner}/` : '';
  }

  // Plain-text summary of a field's value for the compact reorder-list rows - the card preview and
  // the results tree render each kind with their own richer layout (audio buttons, badges, etc.).
  protected fieldValueText(field: EntryFieldData): string {
    switch (field.kind) {
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

  // The reorder list's label for a group - the headword (and part of speech) of whichever field in
  // it is a headword, falling back to a generic label for a group that has none (any other mix of
  // fields is a perfectly valid group - see the class comment on OrderGroupData).
  protected groupLabelFor(side: CardSide, group: TreeNode): string {
    const headword = this.groupFieldsFor(group).find((placed) => placed.field.kind === 'headword');
    if (!headword) {
      const index = this.orderBySide[side]().indexOf(group);
      return `Group ${index + 1}`;
    }
    const entry = headword.field.entry;
    return entry.partOfSpeech ? `${entry.headword} (${entry.partOfSpeech})` : entry.headword;
  }

  protected fieldPathLabel(field: EntryFieldData): string {
    return buildPath(field.sourceLabel, field.entryOrdinal, field.entryCount, field.label);
  }

  private isGroupNode(node: TreeNode): boolean {
    return !!(node.data as OrderGroupData | undefined)?.isGroup;
  }

  // Rebuilds a side's order tree from a target set of checked results-tree leaves: copies are left
  // exactly where they are (they aren't tied to any checkbox); an existing original leaf is kept in
  // whichever group it currently sits in (the user may have dragged it) as long as it's still
  // checked, and dropped otherwise; a newly checked leaf that isn't anywhere yet is appended into
  // its own entry's default group (created fresh at the end if that group doesn't currently exist -
  // e.g. it was emptied out earlier by the user moving everything out of it).
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

    const additionsByEntry = new Map<string, TreeNode[]>();
    for (const key of checkedKeys) {
      if (seenOriginalKeys.has(key)) {
        continue;
      }
      const field = fieldsByKey.get(key)!;
      const placed: PlacedField = { instanceKey: key, field, isCopy: false };
      const child: TreeNode = { key, data: placed };
      const list = additionsByEntry.get(field.entryKey);
      if (list) {
        list.push(child);
      } else {
        additionsByEntry.set(field.entryKey, [child]);
      }
    }

    for (const [entryKey, newChildren] of additionsByEntry) {
      const groupKey = `group-${entryKey}`;
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
        const copy: TreeNode = { key: copyKey, data: { instanceKey: copyKey, field: source.field, isCopy: true } satisfies PlacedField };
        const nextChildren = [...children];
        nextChildren.splice(index + 1, 0, copy);
        return { ...group, children: nextChildren };
      }),
    );
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

  // Vets every drag before PrimeNG applies it (the tree's [validateDrop]="true" routes drops
  // through here instead of auto-applying them): groups may only reorder among themselves at the
  // top level (never nest inside another group), a field may only join a group by dropping directly
  // onto its header or between two of its existing fields (never nest inside another field, which
  // is what PrimeNG's default reparenting would otherwise do), and no drop may give a group a
  // second headword.
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
      valid = dropIsGroup && !this.wouldConflictOnHeadword(dragNode, dropNode);
    } else {
      const targetGroup = dropIsGroup ? undefined : this.ownerGroup(side, dropNode);
      valid = !!targetGroup && !this.wouldConflictOnHeadword(dragNode, targetGroup);
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
