import { makeSearch } from '../../../testing/dictionary-fixtures';
import type { CardLayout } from '../../card/card-field';
import {
  addRichText,
  duplicateField,
  fromTreeNodes,
  groupLabel,
  isValidDrop,
  nextId,
  placedOriginalKeys,
  reconcile,
  removeField,
  restoreLayout,
  serializeLayout,
  toTreeNodes,
} from './card-layout';
import { buildResultTrees, collectFields } from './results-tree';

const fields = collectFields(buildResultTrees(makeSearch).values());
const keys = (layout: CardLayout) =>
  layout.map((group) => [group.key, group.fields.map((p) => p.instanceKey)]);

describe('card layout', () => {
  const head = ['Longman-0-headword', 'Longman-0-partOfSpeech'];
  const sense = ['Longman-0-sense-0-senseDefinition', 'Longman-0-sense-0-example-0'];
  const inflection = 'Longman-0-inflection-0';
  const base = reconcile([], new Set([...head, inflection, ...sense]), fields);

  it('places newly checked fields in their default groups', () => {
    expect(keys(base)).toEqual([
      ['group-Longman-0', head],
      ['group-inflections-Longman', [inflection]],
      ['group-sense-Longman-0-0', sense],
    ]);
  });

  it('returns the same layout when the checked set is unchanged', () => {
    expect(reconcile(base, placedOriginalKeys(base), fields)).toBe(base);
  });

  it('removes unchecked originals but keeps copies and rich text', () => {
    const withExtras = addRichText(duplicateField(base, 'Longman-0-partOfSpeech', 7), 8, 'rtl');
    const next = reconcile(withExtras, new Set(['Longman-0-headword']), fields);
    expect(keys(next)).toEqual([
      ['group-Longman-0', ['Longman-0-headword', 'Longman-0-partOfSpeech-copy-7']],
      ['group-richtext-8', ['richtext-8']],
    ]);
  });

  it('never duplicates a headword, and gives rich-text copies their own text', () => {
    expect(duplicateField(base, 'Longman-0-headword', 1)).toEqual(base);

    const withText = addRichText([], 0, 'ltr');
    const copied = duplicateField(withText, 'richtext-0', 1);
    const [original, copy] = copied[0].fields.map((p) => p.field);
    if (original.kind !== 'richText' || copy.kind !== 'richText')
      throw new Error('expected rich text');
    copy.html.set('changed');
    expect(original.html()).toBe('');
  });

  it('enforces the drop rules', () => {
    const drop = (dragKey: string, targetKey: string, point: 'node' | 'between') =>
      isValidDrop(base, { dragKey, targetKey, point });

    expect(drop('group-Longman-0', 'group-sense-Longman-0-0', 'between')).toBe(true);
    expect(drop('group-Longman-0', 'group-sense-Longman-0-0', 'node')).toBe(false);
    expect(drop('Longman-0-sense-0-example-0', 'group-Longman-0', 'node')).toBe(true);
    expect(drop('Longman-0-sense-0-example-0', 'Longman-0-headword', 'between')).toBe(true);
    expect(drop('Longman-0-sense-0-example-0', 'Longman-0-headword', 'node')).toBe(false);
    expect(drop(inflection, 'group-Longman-0', 'node')).toBe(false);

    // A second entry's headword may join a group that has none, but not one that already has one.
    const headword = fields.get('Longman-0-headword')!;
    const other = {
      instanceKey: 'Oxford-0-headword',
      field: { ...headword, entryKey: 'Oxford-0' },
      isCopy: false,
    };
    const twoEntries: CardLayout = [...base, { key: 'group-Oxford-0', fields: [other] }];
    const dropOther = (targetKey: string) =>
      isValidDrop(twoEntries, { dragKey: 'Oxford-0-headword', targetKey, point: 'node' });
    expect(dropOther('group-Longman-0')).toBe(false);
    expect(dropOther('group-sense-Longman-0-0')).toBe(true);
  });

  it('reads a rearranged tree view back into a layout, dropping emptied groups', () => {
    const nodes = toTreeNodes(base, new Set());
    const moved = nodes[1].children!.pop()!;
    nodes[0].children!.push(moved);
    expect(keys(fromTreeNodes(nodes))).toEqual([
      ['group-Longman-0', [...head, inflection]],
      ['group-sense-Longman-0-0', sense],
    ]);
  });

  it('labels groups by their most telling field', () => {
    expect(base.map((group, index) => groupLabel(group, index))).toEqual([
      'make (verb)',
      'Longman:Inflection forms',
      'Longman:1. to produce something',
    ]);
  });

  it('round-trips through serialization, counting fields that no longer resolve', () => {
    const layout = duplicateField(addRichText(base, 3, 'rtl'), 'Longman-0-sense-0-example-0', 4);
    const serialized = serializeLayout(layout);
    expect(serialized.at(-1)).toEqual({
      key: 'group-richtext-3',
      fields: [{ t: 'rich', instanceKey: 'richtext-3', isCopy: false, html: '', direction: 'rtl' }],
    });

    const restored = restoreLayout(serialized, fields);
    expect(keys(restored.layout)).toEqual(keys(layout));
    expect(restored.dropped).toBe(0);

    const missing = new Map(fields);
    missing.delete('Longman-0-sense-0-example-0');
    expect(restoreLayout(serialized, missing).dropped).toBe(2);
  });

  it('picks ids that do not collide with existing copies or rich text', () => {
    const layout = duplicateField(addRichText(base, 5, 'ltr'), 'Longman-0-partOfSpeech', 9);
    expect(nextId([layout, []])).toBe(10);
    expect(nextId([[]])).toBe(0);
  });

  it('removes a field and any group it leaves empty', () => {
    expect(keys(removeField(base, inflection))).toEqual([
      ['group-Longman-0', head],
      ['group-sense-Longman-0-0', sense],
    ]);
  });
});
