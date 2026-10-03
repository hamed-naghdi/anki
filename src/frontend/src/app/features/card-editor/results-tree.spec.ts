import { makeEntry, makeSearch } from '../../../testing/dictionary-fixtures';
import {
  buildResultTrees,
  checkedFieldKeys,
  collectFields,
  selectionKeysFor,
  sourcesWithResults,
  type ResultNode,
} from './results-tree';

function keysOf(nodes: readonly ResultNode[]): string[] {
  return nodes.flatMap((node) => [node.key!, ...keysOf(node.children ?? [])]);
}

describe('results tree', () => {
  const trees = buildResultTrees(makeSearch);
  const longman = trees.get('Longman')!;
  const fields = collectFields(trees.values());

  it('only lists sources that returned entries', () => {
    expect(sourcesWithResults(makeSearch)).toEqual(['Longman']);
  });

  // Saved cards refer to fields by these keys, so they must never change.
  it('keeps the persisted node keys stable', () => {
    expect(keysOf(longman)).toEqual([
      'Longman-0',
      'Longman-0-head',
      'Longman-0-headword',
      'Longman-0-homographNumber',
      'Longman-0-partOfSpeech',
      'Longman-0-pronunciation-british',
      'Longman-0-pronunciation-american',
      'Longman-0-inflectionForms',
      'Longman-0-inflection-0',
      'Longman-0-senses',
      'Longman-0-sense-0',
      'Longman-0-sense-0-senseGrammar',
      'Longman-0-sense-0-senseDefinition',
      'Longman-0-sense-0-examples',
      'Longman-0-sense-0-example-0',
      'Longman-0-sense-0-example-1-header-group',
      'Longman-0-sense-0-example-1-header',
      'Longman-0-sense-0-example-1-0',
      'Longman-0-sense-0-example-2-header-group',
      'Longman-0-sense-0-example-2-header',
      'Longman-0-sense-0-example-2-0',
      'Longman-0-sense-0-example-2-1',
      'Longman-0-sense-0-example-3-header',
      'Longman-0-sense-1',
      'Longman-0-sense-1-senseDefinition',
      'Longman-0-sense-1-senseSynonyms',
      'Longman-0-collocations',
      'Longman-0-collocations-0-0',
      'Longman-0-collocation-0-0-0-group',
      'Longman-0-collocation-0-0-0',
      'Longman-0-collocation-0-0-0-example-0',
      'Longman-0-collocation-0-0-0-example-1',
      'Longman-0-collocation-0-0-1',
    ]);
  });

  it('labels example groups by their phrase and numbers examples across the sense', () => {
    const examples = longman[0].children![2].children![0].children!.at(-1)!;
    expect(examples.children!.map((node) => node.label)).toEqual([
      'Example 1',
      'Pattern: make somebody something',
      'Collocation: make a hole',
      'Pattern',
    ]);
    expect(examples.children![2].children!.map((node) => node.label)).toEqual([
      'Collocation',
      'Example 3',
      'Example 4',
    ]);
  });

  it('groups collocations by section, each phrase with its own examples', () => {
    const collocations = longman[0].children!.at(-1)!;
    expect(collocations.label).toBe('Collocations');
    const verbs = collocations.children![0];
    expect(verbs.label).toBe('verbs');
    expect(verbs.children!.map((node) => node.label)).toEqual([
      'book an appointment',
      'Collocation',
    ]);
    expect(verbs.children![0].children!.map((node) => node.label)).toEqual([
      'Collocation',
      'Example 1',
      'Example 2',
    ]);
  });

  // Same-spelled homographs (Oxford "tear¹ verb" vs. "tear² verb") must stay distinguishable.
  it('labels an entry with its homograph number', () => {
    expect(longman[0].label).toBe('make¹ (verb)');
    const tear2 = buildResultTrees({
      word: 'tear',
      results: [
        {
          source: 'Oxford',
          entries: [{ ...makeEntry, headword: 'tear', homographNumber: '12', partOfSpeech: 'noun' }],
        },
      ],
    }).get('Oxford')!;
    expect(tear2[0].label).toBe('tear¹² (noun)');
  });

  it('collects every selectable field leaf', () => {
    expect(fields.get('Longman-0-sense-0-example-2-1')).toMatchObject({
      kind: 'example',
      senseIndex: 0,
      exampleIndex: 2,
      subExampleIndex: 1,
    });
    expect(fields.has('Longman-0-head')).toBe(false);
  });

  it('derives checked and partially checked parents from checked leaves', () => {
    const keys = selectionKeysFor(
      longman,
      new Set([
        'Longman-0-sense-0-example-2-header',
        'Longman-0-sense-0-example-2-0',
        'Longman-0-sense-0-example-2-1',
      ]),
    );
    expect(keys['Longman-0-sense-0-example-2-header-group']).toEqual({
      checked: true,
      partialChecked: false,
    });
    expect(keys['Longman-0-sense-0-examples']).toEqual({ checked: false, partialChecked: true });
    expect(keys['Longman-0']).toEqual({ checked: false, partialChecked: true });
    expect(keys['Longman-0-head']).toBeUndefined();
  });

  it('reads back only checked field leaves', () => {
    const checked = checkedFieldKeys(
      {
        'Longman-0-head': { checked: true },
        'Longman-0-headword': { checked: true },
        'Longman-0-partOfSpeech': { checked: false },
      },
      fields,
    );
    expect([...checked]).toEqual(['Longman-0-headword']);
  });
});
