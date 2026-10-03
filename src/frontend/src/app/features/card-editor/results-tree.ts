import type { TreeNode } from 'primeng/api';
import {
  americanPhonetic,
  britishPhonetic,
  entryTitle,
  exampleGroupPhrase,
  type EntryField,
  type EntryFieldKind,
} from '../../card/card-field';
import {
  isExampleGroup,
  type CollocationGroup,
  type DictionaryEntry,
  type DictionaryExample,
  type DictionarySearchResult,
  type DictionarySense,
} from '../../core/dictionary/dictionary.models';

/**
 * The search results as checkbox trees, one per dictionary source: entry → organizational groups
 * (Head, Inflection forms, Senses → each sense → Examples, Collocations → each section → each
 * collocation) → one leaf per selectable field. Checking
 * any node checks everything under it (PrimeNG's own propagation), which is how a whole entry,
 * sense, or example group gets placed in one click.
 *
 * Node keys are persisted (a saved card refers to its fields by them - see card-state.ts), so they
 * must stay stable across releases.
 */

export type ResultNodeData =
  | { readonly type: 'entry'; readonly entry: DictionaryEntry }
  | { readonly type: 'group' }
  | { readonly type: 'field'; readonly field: EntryField };

export type ResultNode = TreeNode<ResultNodeData>;

/** p-tree's checkbox `selectionKeys` format: only checked or partially checked nodes appear. */
export type SelectionKeys = Record<string, { checked: boolean; partialChecked: boolean }>;

/** Sources that came back with something to show (not errored, not empty). */
export function sourcesWithResults(search: DictionarySearchResult): string[] {
  return search.results
    .filter((result) => !result.error && result.entries.length > 0)
    .map((result) => result.source);
}

/**
 * Fresh trees for every source. p-tree writes expansion and checkbox state onto the node objects
 * themselves, so each tree instance needs its own copy.
 */
export function buildResultTrees(search: DictionarySearchResult): Map<string, ResultNode[]> {
  return new Map(
    search.results.map((result) => [
      result.source,
      result.entries.map((entry, index) =>
        entryNode(
          entry,
          `${result.source}-${index}`,
          result.source,
          index + 1,
          result.entries.length,
        ),
      ),
    ]),
  );
}

/** Every selectable field leaf, by key. */
export function collectFields(trees: Iterable<readonly ResultNode[]>): Map<string, EntryField> {
  const fields = new Map<string, EntryField>();
  const visit = (nodes: readonly ResultNode[]) => {
    for (const node of nodes) {
      if (node.data?.type === 'field') {
        fields.set(node.key!, node.data.field);
      }
      visit(node.children ?? []);
    }
  };
  for (const roots of trees) {
    visit(roots);
  }
  return fields;
}

/**
 * The tree's checkbox state for a set of checked leaf keys: a parent is checked when all its
 * children are, and partially checked when any descendant is.
 */
export function selectionKeysFor(
  roots: readonly ResultNode[],
  checkedLeaves: ReadonlySet<string>,
): SelectionKeys {
  const keys: SelectionKeys = {};

  const visit = (node: ResultNode): 'all' | 'some' | 'none' => {
    let state: 'all' | 'some' | 'none';
    if (!node.children?.length) {
      state = checkedLeaves.has(node.key!) ? 'all' : 'none';
    } else {
      const states = node.children.map(visit);
      state = states.every((s) => s === 'all')
        ? 'all'
        : states.some((s) => s !== 'none')
          ? 'some'
          : 'none';
    }
    if (state !== 'none') {
      keys[node.key!] = { checked: state === 'all', partialChecked: state === 'some' };
    }
    return state;
  };

  roots.forEach(visit);
  return keys;
}

/** The field leaves a tree reports as checked. */
export function checkedFieldKeys(
  keys: Record<string, { checked?: boolean } | boolean> | null | undefined,
  fields: ReadonlyMap<string, EntryField>,
): Set<string> {
  return new Set(
    Object.entries(keys ?? {})
      .filter(([key, value]) => fields.has(key) && (value === true || (value && value.checked)))
      .map(([key]) => key),
  );
}

/** "1. to get something by paying money for it", or "Sense 1" for a sense with no definition. */
export function senseLabel(sense: DictionarySense, senseIndex: number): string {
  const definition = sense.definition;
  if (!definition) {
    return `Sense ${senseIndex + 1}`;
  }
  const snippet = definition.length > 48 ? `${definition.slice(0, 47)}…` : definition;
  return `${senseIndex + 1}. ${snippet}`;
}

function groupNode(key: string, label: string, children: ResultNode[]): ResultNode {
  return { key, label, data: { type: 'group' }, children };
}

// The label is the entry's own headword, not the searched term - a source can fall back to a
// related word (Oxford has no "walk free" entry, so it lands on "free"), and labelling that with
// the search text would misrepresent what the entry and its audio actually are.
function entryNode(
  entry: DictionaryEntry,
  entryKey: string,
  sourceLabel: string,
  entryOrdinal: number,
  entryCount: number,
): ResultNode {
  type Indices = Pick<
    EntryField,
    | 'formIndex'
    | 'senseIndex'
    | 'exampleIndex'
    | 'subExampleIndex'
    | 'collocationGroupIndex'
    | 'collocationSectionIndex'
    | 'collocationIndex'
    | 'collocationExampleIndex'
  >;

  const field = (kind: EntryFieldKind, label: string, indices: Indices = {}): ResultNode => ({
    key: fieldKey(entryKey, kind, indices),
    label,
    data: {
      type: 'field',
      field: { kind, label, entry, entryKey, sourceLabel, entryOrdinal, entryCount, ...indices },
    },
  });

  // Checking a whole group places its fields in this order, so it follows the printed-dictionary
  // order regardless of which of these a given source actually has.
  const head: ResultNode[] = [];
  if (entry.isKeyword || entry.keywordLevel) head.push(field('keyword', 'Keyword & level'));
  head.push(field('headword', 'Headword'));
  if (entry.homographNumber) head.push(field('homographNumber', 'Homograph number'));
  if (entry.hyphenation) head.push(field('hyphenation', 'Hyphenation'));
  if (entry.partOfSpeech) head.push(field('partOfSpeech', 'Part of speech'));
  if (entry.grammar) head.push(field('grammar', 'Grammar'));
  if (britishPhonetic(entry)) head.push(field('pronunciation-british', 'Pronunciation (UK)'));
  if (americanPhonetic(entry)) head.push(field('pronunciation-american', 'Pronunciation (US)'));
  if (entry.frequencyLabels?.length) head.push(field('frequencyLabels', 'Frequency'));

  const children = [groupNode(`${entryKey}-head`, 'Head', head)];

  if (entry.inflectionForms.length) {
    children.push(
      groupNode(
        `${entryKey}-inflectionForms`,
        'Inflection forms',
        entry.inflectionForms.map((form, formIndex) =>
          field('inflectionForm', form.label ?? 'Inflection form', { formIndex }),
        ),
      ),
    );
  }

  // Within a sense, the order a dictionary prints it in: illustration, level, signpost,
  // grammar/register, a phrasal verb's own pattern, definition, synonyms/antonyms, examples.
  const senses: ResultNode[] = [];
  entry.senses.forEach((sense, senseIndex) => {
    const at = { senseIndex };
    const parts: ResultNode[] = [];
    if (sense.imageUrl) parts.push(field('senseImage', 'Picture', at));
    if (sense.isKeyword || sense.cefrLevel) parts.push(field('senseKeyword', 'Level', at));
    if (sense.signpost) parts.push(field('senseSignpost', 'Signpost', at));
    if (sense.grammar) parts.push(field('senseGrammar', 'Grammar', at));
    if (sense.register) parts.push(field('senseRegister', 'Register', at));
    if (sense.phrasalVerbPattern) parts.push(field('sensePhrasalVerbPattern', 'Pattern', at));
    if (sense.definition) parts.push(field('senseDefinition', 'Definition', at));
    if (sense.synonyms.length) parts.push(field('senseSynonyms', 'Synonyms', at));
    if (sense.antonyms.length) parts.push(field('senseAntonyms', 'Antonyms', at));
    if (sense.examples.length) {
      parts.push(
        groupNode(
          `${entryKey}-sense-${senseIndex}-examples`,
          'Examples',
          exampleNodes(sense.examples, senseIndex, field),
        ),
      );
    }
    if (parts.length) {
      senses.push(
        groupNode(`${entryKey}-sense-${senseIndex}`, senseLabel(sense, senseIndex), parts),
      );
    }
  });
  if (senses.length) {
    children.push(groupNode(`${entryKey}-senses`, 'Senses', senses));
  }

  const collocations = collocationNodes(entry.collocationGroups ?? [], entryKey, field);
  if (collocations.length) {
    children.push(groupNode(`${entryKey}-collocations`, 'Collocations', collocations));
  }

  return { key: entryKey, label: entryTitle(entry), data: { type: 'entry', entry }, children };
}

// A plain example is one leaf. A Longman collocation/grammar group becomes its own sub-group - the
// phrase as an `exampleHeader` leaf, then one leaf per example under it - so checking the group
// places the phrase with its examples, while each stays selectable on its own. A group with no
// examples is just the header leaf. Numbering runs across the whole sense, nested ones included.
function exampleNodes(
  examples: readonly DictionaryExample[],
  senseIndex: number,
  field: (kind: EntryFieldKind, label: string, indices: Partial<EntryField>) => ResultNode,
): ResultNode[] {
  let ordinal = 0;
  const leaf = (exampleIndex: number, subExampleIndex?: number) =>
    field('example', `Example ${++ordinal}`, { senseIndex, exampleIndex, subExampleIndex });

  return examples.map((example, exampleIndex) => {
    if (!isExampleGroup(example)) {
      return leaf(exampleIndex);
    }
    const kind = example.sourceType === 'LongmanCollectionExample' ? 'Collocation' : 'Pattern';
    const header = field('exampleHeader', kind, { senseIndex, exampleIndex });
    const nested = (example.examples ?? []).map((_, sub) => leaf(exampleIndex, sub));
    return nested.length
      ? groupNode(`${header.key}-group`, `${kind}: ${exampleGroupPhrase(example)}`, [
          header,
          ...nested,
        ])
      : header;
  });
}

// Collocations box → section ("verbs") → collocation. A collocation with examples becomes its own
// sub-group - the phrase as a `collocation` leaf, then one leaf per example - the same shape as a
// Longman collocation/grammar example group. Most entries have a single box, so its sections sit
// directly under "Collocations"; only several boxes get a level of their own.
function collocationNodes(
  groups: readonly CollocationGroup[],
  entryKey: string,
  field: (kind: EntryFieldKind, label: string, indices: Partial<EntryField>) => ResultNode,
): ResultNode[] {
  const boxes = groups.map((group, collocationGroupIndex) => {
    const sections = group.sections.map((section, collocationSectionIndex) => {
      const items = section.collocations.map((collocation, collocationIndex) => {
        const at = { collocationGroupIndex, collocationSectionIndex, collocationIndex };
        const header = field('collocation', 'Collocation', at);
        const examples = (collocation.examples ?? []).map((_, collocationExampleIndex) =>
          field('collocationExample', `Example ${collocationExampleIndex + 1}`, {
            ...at,
            collocationExampleIndex,
          }),
        );
        return examples.length
          ? groupNode(`${header.key}-group`, collocation.phrase, [header, ...examples])
          : header;
      });
      return groupNode(
        `${entryKey}-collocations-${collocationGroupIndex}-${collocationSectionIndex}`,
        section.heading,
        items,
      );
    });
    return { group, sections, collocationGroupIndex };
  });

  if (boxes.length === 1) {
    return boxes[0].sections;
  }
  return boxes.map(({ group, sections, collocationGroupIndex }) =>
    groupNode(
      `${entryKey}-collocations-${collocationGroupIndex}`,
      group.meaningHint ?? `Box ${collocationGroupIndex + 1}`,
      sections,
    ),
  );
}

function fieldKey(
  entryKey: string,
  kind: EntryFieldKind,
  {
    formIndex,
    senseIndex,
    exampleIndex,
    subExampleIndex,
    collocationGroupIndex,
    collocationSectionIndex,
    collocationIndex,
    collocationExampleIndex,
  }: Partial<EntryField>,
): string {
  if (collocationIndex !== undefined) {
    const base = `${entryKey}-collocation-${collocationGroupIndex}-${collocationSectionIndex}-${collocationIndex}`;
    return collocationExampleIndex !== undefined ? `${base}-example-${collocationExampleIndex}` : base;
  }
  if (exampleIndex !== undefined) {
    // A plain example keeps the "-example-N" key it had before example groups existed.
    const suffix =
      kind === 'exampleHeader'
        ? '-header'
        : subExampleIndex !== undefined
          ? `-${subExampleIndex}`
          : '';
    return `${entryKey}-sense-${senseIndex}-example-${exampleIndex}${suffix}`;
  }
  if (senseIndex !== undefined) return `${entryKey}-sense-${senseIndex}-${kind}`;
  if (formIndex !== undefined) return `${entryKey}-inflection-${formIndex}`;
  return `${entryKey}-${kind}`;
}
