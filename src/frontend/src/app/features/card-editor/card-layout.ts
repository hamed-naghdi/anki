import { signal } from '@angular/core';
import type { TreeNode } from 'primeng/api';
import {
  senseOf,
  sourcePath,
  type CardLayout,
  type EntryField,
  type LayoutGroup,
  type PlacedField,
  type TextDirection,
} from '../../card/card-field';
import type { SerializedGroup } from '../../card/card-state';
import { senseLabel } from './results-tree';

/**
 * Operations on one card side's layout - free-form groups of placed fields that the user builds by
 * checking fields in the results tree, then dragging fields and groups around. All functions are
 * pure: they return a new layout (or the same one, when nothing changed) and never mutate.
 *
 * The rules the user can't override: a group holds at most one headword, and inflection forms stay
 * in whichever single group they were placed in.
 */

/** Keys of the entry fields placed as originals - exactly the leaves checked in the results tree. */
export function placedOriginalKeys(layout: CardLayout): Set<string> {
  const keys = new Set<string>();
  for (const group of layout) {
    for (const placed of group.fields) {
      if (!placed.isCopy && placed.field.kind !== 'richText') {
        keys.add(placed.instanceKey);
      }
    }
  }
  return keys;
}

/**
 * Brings a layout in line with a new set of checked results-tree leaves. A placed original that is
 * no longer checked is removed; copies and rich-text blocks aren't tied to a checkbox and stay put.
 * A newly checked field is appended to its default group: its sense's group for sense-scoped
 * fields, its source's shared inflections group for inflection forms (so homographs from one
 * dictionary share it, but different dictionaries never do), else its entry's group.
 */
export function reconcile(
  layout: CardLayout,
  checked: ReadonlySet<string>,
  fields: ReadonlyMap<string, EntryField>,
): CardLayout {
  const placed = placedOriginalKeys(layout);
  const removed = [...placed].filter((key) => !checked.has(key));
  const added = [...checked].filter((key) => !placed.has(key) && fields.has(key));
  if (!removed.length && !added.length) {
    return layout;
  }

  const removedKeys = new Set(removed);
  let next = layout
    .map((group) =>
      withFields(
        group,
        group.fields.filter((p) => !removedKeys.has(p.instanceKey)),
      ),
    )
    .filter((group) => group.fields.length > 0);

  for (const key of added) {
    const field = fields.get(key)!;
    const groupKey = defaultGroupKey(field);
    const placement: PlacedField = { instanceKey: key, field, isCopy: false };
    next = next.some((group) => group.key === groupKey)
      ? next.map((group) =>
          group.key === groupKey ? withFields(group, [...group.fields, placement]) : group,
        )
      : [...next, { key: groupKey, fields: [placement] }];
  }
  return next;
}

export function removeField(layout: CardLayout, instanceKey: string): CardLayout {
  return layout
    .map((group) =>
      withFields(
        group,
        group.fields.filter((p) => p.instanceKey !== instanceKey),
      ),
    )
    .filter((group) => group.fields.length > 0);
}

export function removeGroup(layout: CardLayout, groupKey: string): CardLayout {
  return layout.filter((group) => group.key !== groupKey);
}

/**
 * Inserts an independent copy right after a field, in the same group - the user drags it wherever
 * they want next. Headwords can't be copied (a group may only hold one). A rich-text copy gets its
 * own `html` signal, so editing one never edits the other.
 */
export function duplicateField(layout: CardLayout, instanceKey: string, id: number): CardLayout {
  return layout.map((group) => {
    const index = group.fields.findIndex((p) => p.instanceKey === instanceKey);
    const source = group.fields[index];
    if (!source || source.field.kind === 'headword') {
      return group;
    }
    const field =
      source.field.kind === 'richText'
        ? { ...source.field, html: signal(source.field.html()) }
        : source.field;
    const copyKey = `${instanceKey}-copy-${id}`;
    const fields = [...group.fields];
    fields.splice(index + 1, 0, { instanceKey: copyKey, field, isCopy: true });
    return withFields(group, fields);
  });
}

/** A new, empty rich-text block in a group of its own at the end. */
export function addRichText(layout: CardLayout, id: number, direction: TextDirection): CardLayout {
  const instanceKey = `richtext-${id}`;
  return [
    ...layout,
    {
      key: `group-${instanceKey}`,
      fields: [
        { instanceKey, field: { kind: 'richText', html: signal(''), direction }, isCopy: false },
      ],
    },
  ];
}

/** An id for a new copy or rich-text block that doesn't collide with any in these layouts. */
export function nextId(layouts: readonly CardLayout[]): number {
  let max = -1;
  for (const layout of layouts) {
    for (const group of layout) {
      for (const { instanceKey } of group.fields) {
        for (const match of instanceKey.matchAll(/(?:copy|richtext)-(\d+)/g)) {
          max = Math.max(max, Number(match[1]));
        }
      }
    }
  }
  return max + 1;
}

export interface LayoutDrop {
  readonly dragKey: string;
  readonly targetKey: string;
  /** 'node': onto the target itself; 'between': next to it, among its siblings. */
  readonly point: 'node' | 'between';
}

/**
 * Whether a drag-and-drop is allowed: groups only reorder among themselves (never nest), a field
 * only lands onto a group header or between two fields (never inside another field), no group gets
 * a second headword, and an inflection form never leaves its group.
 */
export function isValidDrop(
  layout: CardLayout,
  { dragKey, targetKey, point }: LayoutDrop,
): boolean {
  const targetGroup = layout.find((group) => group.key === targetKey);
  if (layout.some((group) => group.key === dragKey)) {
    return point === 'between' && !!targetGroup;
  }

  const dragged = findField(layout, dragKey);
  const destination =
    point === 'node' ? targetGroup : targetGroup ? undefined : ownerGroup(layout, targetKey);
  if (!dragged || !destination) {
    return false;
  }
  if (
    dragged.field.kind === 'headword' &&
    destination.fields.some((p) => p.instanceKey !== dragKey && p.field.kind === 'headword')
  ) {
    return false;
  }
  return dragged.field.kind !== 'inflectionForm' || ownerGroup(layout, dragKey) === destination;
}

/** The reorder list's label for a group, from the most telling field in it. */
export function groupLabel(group: LayoutGroup, index: number): string {
  const fields = group.fields.map((placed) => placed.field);

  const headword = fields.find((field) => field.kind === 'headword');
  if (headword?.kind === 'headword') {
    const { headword: word, partOfSpeech } = headword.entry;
    return partOfSpeech ? `${word} (${partOfSpeech})` : word;
  }

  const inflection = fields.find((field) => field.kind === 'inflectionForm');
  if (inflection?.kind === 'inflectionForm') {
    return sourcePath(inflection, 'Inflection forms');
  }

  for (const field of fields) {
    if (field.kind !== 'richText' && field.senseIndex !== undefined) {
      const sense = senseOf(field);
      return sourcePath(field, sense ? senseLabel(sense, field.senseIndex) : 'Sense');
    }
  }

  return fields.some((field) => field.kind === 'richText') ? 'Custom text' : `Group ${index + 1}`;
}

// --- p-tree view ---------------------------------------------------------------------------------

export type LayoutNodeData =
  | { readonly type: 'group'; readonly group: LayoutGroup }
  | { readonly type: 'field'; readonly placed: PlacedField };

export type LayoutNode = TreeNode<LayoutNodeData>;

/** The layout as p-tree nodes, for the drag-and-drop reorder list. */
export function toTreeNodes(layout: CardLayout, expanded: ReadonlySet<string>): LayoutNode[] {
  return layout.map((group) => ({
    key: group.key,
    expanded: expanded.has(group.key),
    data: { type: 'group', group },
    children: group.fields.map((placed) => ({
      key: placed.instanceKey,
      leaf: true,
      data: { type: 'field', placed },
    })),
  }));
}

/** Reads a layout back from p-tree nodes after a drop rearranged them; empty groups are dropped. */
export function fromTreeNodes(nodes: readonly LayoutNode[]): CardLayout {
  const layout: LayoutGroup[] = [];
  for (const node of nodes) {
    if (node.data?.type !== 'group') continue;
    const fields = (node.children ?? []).flatMap((child) =>
      child.data?.type === 'field' ? [child.data.placed] : [],
    );
    if (fields.length) {
      layout.push(withFields(node.data.group, fields));
    }
  }
  return layout;
}

// --- persistence ---------------------------------------------------------------------------------

export function serializeLayout(layout: CardLayout): SerializedGroup[] {
  return layout.map((group) => ({
    key: group.key,
    fields: group.fields.map(({ instanceKey, isCopy, field }) =>
      field.kind === 'richText'
        ? {
            t: 'rich' as const,
            instanceKey,
            isCopy,
            html: field.html(),
            direction: field.direction,
          }
        : {
            t: 'entry' as const,
            instanceKey,
            isCopy,
            // An original's instanceKey IS its results-tree key; a copy appends "-copy-N".
            key: instanceKey.replace(/(-copy-\d+)+$/, ''),
          },
    ),
  }));
}

/**
 * Rebuilds a saved layout against the current results tree. A saved field whose key no longer
 * resolves (the stored search no longer has it) is dropped, and counted.
 */
export function restoreLayout(
  groups: readonly SerializedGroup[],
  fields: ReadonlyMap<string, EntryField>,
): { layout: CardLayout; dropped: number } {
  let dropped = 0;
  const layout: LayoutGroup[] = [];

  for (const group of groups) {
    const placed: PlacedField[] = [];
    for (const saved of group.fields) {
      if (saved.t === 'rich') {
        placed.push({
          instanceKey: saved.instanceKey,
          isCopy: saved.isCopy,
          field: { kind: 'richText', html: signal(saved.html), direction: saved.direction },
        });
        continue;
      }
      const field = fields.get(saved.key);
      if (field) {
        placed.push({ instanceKey: saved.instanceKey, isCopy: saved.isCopy, field });
      } else {
        dropped++;
      }
    }
    if (placed.length) {
      layout.push({ key: group.key, fields: placed });
    }
  }

  return { layout, dropped };
}

// --- helpers -------------------------------------------------------------------------------------

function withFields(group: LayoutGroup, fields: readonly PlacedField[]): LayoutGroup {
  return fields.length === group.fields.length &&
    fields.every((field, index) => field === group.fields[index])
    ? group
    : { ...group, fields };
}

function findField(layout: CardLayout, instanceKey: string): PlacedField | undefined {
  for (const group of layout) {
    const found = group.fields.find((p) => p.instanceKey === instanceKey);
    if (found) return found;
  }
  return undefined;
}

function ownerGroup(layout: CardLayout, instanceKey: string): LayoutGroup | undefined {
  return layout.find((group) => group.fields.some((p) => p.instanceKey === instanceKey));
}

function defaultGroupKey(field: EntryField): string {
  if (field.kind === 'inflectionForm') return `group-inflections-${field.sourceLabel}`;
  if (field.senseIndex !== undefined) return `group-sense-${field.entryKey}-${field.senseIndex}`;
  return `group-${field.entryKey}`;
}
