import type { WritableSignal } from '@angular/core';
import {
  isExampleGroup,
  type Collocation,
  type DictionaryEntry,
  type ExampleGroup,
  type PhoneticVariant,
  type SimpleExample,
} from '../core/dictionary/dictionary.models';

/**
 * The pieces a card is assembled from. A card side is an ordered list of groups, each an ordered
 * list of placed fields; a field is either one piece of a dictionary entry or a block of HTML the
 * user wrote. render-card.ts turns this into the HTML Anki stores; the editor builds and edits it.
 */

// The selectable pieces of a dictionary entry. `inflectionForm` is one specific form ("plural:
// wives"), and the `sense*` kinds / `example` are scoped to one sense (and one example).
// `exampleHeader` is the bold phrase of a Longman collocation/grammar-pattern example group (e.g.
// "make somebody something"), selectable apart from the examples nested under it.
// `collocation` is one phrase from an entry's COLLOCATIONS box (with its region, variants and
// gloss), and `collocationExample` one of the sentences listed under it.
export type EntryFieldKind =
  | 'headword'
  | 'partOfSpeech'
  | 'homographNumber'
  | 'hyphenation'
  | 'grammar'
  | 'pronunciation-british'
  | 'pronunciation-american'
  | 'keyword'
  | 'frequencyLabels'
  | 'inflectionForm'
  | 'senseImage'
  | 'senseDefinition'
  | 'senseKeyword'
  | 'senseSignpost'
  | 'senseGrammar'
  | 'senseRegister'
  | 'sensePhrasalVerbPattern'
  | 'senseSynonyms'
  | 'senseAntonyms'
  | 'exampleHeader'
  | 'example'
  | 'collocation'
  | 'collocationExample';

export interface EntryField {
  readonly kind: EntryFieldKind;
  readonly label: string;
  readonly entry: DictionaryEntry;
  /** Identifies the entry within the search results, e.g. "Longman-0". */
  readonly entryKey: string;
  readonly sourceLabel: string;
  /** 1-based position of the entry among its source's entries, and how many there are. */
  readonly entryOrdinal: number;
  readonly entryCount: number;
  /** kind 'inflectionForm': which of entry.inflectionForms. */
  readonly formIndex?: number;
  /** Every sense-scoped kind: which of entry.senses. */
  readonly senseIndex?: number;
  /** 'example' / 'exampleHeader': which of the sense's examples (for a nested example or a header, its group). */
  readonly exampleIndex?: number;
  /** An 'example' nested in a collocation/grammar group: which of that group's examples. */
  readonly subExampleIndex?: number;
  /** 'collocation' / 'collocationExample': which of entry.collocationGroups, which of its sections, which collocation in it. */
  readonly collocationGroupIndex?: number;
  readonly collocationSectionIndex?: number;
  readonly collocationIndex?: number;
  /** 'collocationExample': which of the collocation's examples. */
  readonly collocationExampleIndex?: number;
}

export type TextDirection = 'ltr' | 'rtl';

/**
 * A free-form HTML block the user authors directly. `html` is a signal of its own so typing into
 * it never has to rebuild the layout around it (which would recreate the textarea and steal focus).
 */
export interface RichTextField {
  readonly kind: 'richText';
  readonly html: WritableSignal<string>;
  readonly direction: TextDirection;
}

export type CardField = EntryField | RichTextField;

/**
 * One field placed on a card side. `instanceKey` is this placement's identity: an entry field's
 * results-tree key for an original, that key plus "-copy-N" for a duplicate, or "richtext-N".
 */
export interface PlacedField {
  readonly instanceKey: string;
  readonly field: CardField;
  readonly isCopy: boolean;
}

export interface LayoutGroup {
  readonly key: string;
  readonly fields: readonly PlacedField[];
}

/** One card side: its groups, in order. */
export type CardLayout = readonly LayoutGroup[];

/**
 * Prose-like kinds that read badly wrapped inline with badges/tags, so each gets its own line.
 * Everything else wraps together dictionary-style ("[transitive] to obtain... SYN buy").
 */
export const STACKED_KINDS: ReadonlySet<CardField['kind']> = new Set<CardField['kind']>([
  'inflectionForm',
  'exampleHeader',
  'example',
  'collocation',
  'collocationExample',
  'richText',
  'senseImage',
]);

// --- resolving a field back to its dictionary data ----------------------------------------------

export function senseOf(field: EntryField) {
  return field.senseIndex === undefined ? null : (field.entry.senses[field.senseIndex] ?? null);
}

export function inflectionOf(field: EntryField) {
  return field.formIndex === undefined
    ? null
    : (field.entry.inflectionForms[field.formIndex] ?? null);
}

/** The collocation/grammar group an 'exampleHeader' or nested 'example' belongs to. */
export function exampleGroupOf(field: EntryField): ExampleGroup | null {
  if (field.exampleIndex === undefined) return null;
  const example = senseOf(field)?.examples[field.exampleIndex];
  return example && isExampleGroup(example) ? example : null;
}

/** The sentence an 'example' points at - a plain example, or one nested in a group. */
export function exampleOf(field: EntryField): SimpleExample | null {
  if (field.exampleIndex === undefined) return null;
  const example = senseOf(field)?.examples[field.exampleIndex];
  if (!example) return null;
  if (!isExampleGroup(example)) return example;
  return field.subExampleIndex === undefined
    ? null
    : (example.examples?.[field.subExampleIndex] ?? null);
}

/** The collocation a 'collocation' or 'collocationExample' points at. */
export function collocationOf(field: EntryField): Collocation | null {
  const { collocationGroupIndex: g, collocationSectionIndex: s, collocationIndex: c } = field;
  if (g === undefined || s === undefined || c === undefined) return null;
  return field.entry.collocationGroups?.[g]?.sections[s]?.collocations[c] ?? null;
}

/** The sentence a 'collocationExample' points at. */
export function collocationExampleOf(field: EntryField): string | null {
  return field.collocationExampleIndex === undefined
    ? null
    : (collocationOf(field)?.examples?.[field.collocationExampleIndex] ?? null);
}

/**
 * Whether `field` is a nested example whose own group header is also in `fields` (one card
 * group) - it then renders indented under that header instead of repeating the phrase itself.
 */
export function isNestedExample(fields: readonly CardField[], field: CardField): boolean {
  if (field.kind === 'collocationExample') {
    return fields.some(
      (other) =>
        other.kind === 'collocation' &&
        other.entryKey === field.entryKey &&
        other.collocationGroupIndex === field.collocationGroupIndex &&
        other.collocationSectionIndex === field.collocationSectionIndex &&
        other.collocationIndex === field.collocationIndex,
    );
  }
  if (field.kind !== 'example' || field.subExampleIndex === undefined) return false;
  return fields.some(
    (other) =>
      other.kind === 'exampleHeader' &&
      other.entryKey === field.entryKey &&
      other.senseIndex === field.senseIndex &&
      other.exampleIndex === field.exampleIndex,
  );
}

/**
 * The "pattern:" lead-in before an example's sentence: Oxford's own per-example pattern, or - for a
 * nested Longman example shown away from its header - that group's phrase, so the example keeps
 * the context it illustrates.
 */
export function examplePrefix(field: EntryField, underHeader: boolean): string | null {
  const own = exampleOf(field)?.pattern;
  if (own) return own;
  if (underHeader || field.subExampleIndex === undefined) return null;
  const group = exampleGroupOf(field);
  return group ? exampleGroupPhrase(group) || null : null;
}

/** The bold phrase a group of examples hangs off - its collocation or its grammar pattern. */
export function exampleGroupPhrase(group: ExampleGroup): string {
  return group.sourceType === 'LongmanCollectionExample' ? group.collection : group.pattern;
}

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * An entry as one line of plain text, e.g. "tear² (noun)" - the homograph number keeps same-spelled
 * entries (tear¹ "rip" vs. tear² "from your eye") apart wherever only text can be shown.
 */
export function entryTitle(entry: DictionaryEntry): string {
  const number = (entry.homographNumber ?? '').replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[+d]);
  const word = `${entry.headword}${number}`;
  return entry.partOfSpeech ? `${word} (${entry.partOfSpeech})` : word;
}

/**
 * The entry's own pronunciation - the unlabelled one, not one tied to an inflection (the backend
 * also sends e.g. "past tense"-labelled pronunciations for irregular verbs).
 */
export function primaryPronunciation(entry: DictionaryEntry) {
  return entry.pronunciations.find((p) => p.label == null) ?? entry.pronunciations[0] ?? null;
}

export function britishPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
  return primaryPronunciation(entry)?.british[0] ?? null;
}

export function americanPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
  return primaryPronunciation(entry)?.american[0] ?? null;
}

/** Longman often prints IPA without its slashes and Oxford always with - normalize to "/.../". */
export function formatIpa(ipa: string): string {
  const inner = ipa.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return inner ? `/${inner}/` : '';
}

/** A frequency label is either Longman's 3-dot band ("●●○") or a spoken/written badge ("S1"). */
export function isFrequencyDots(code: string): boolean {
  return code.includes('●') || code.includes('○');
}

/** 1-based sense number for a group holding sense-scoped fields, so a card numbers its senses. */
export function senseNumber(group: LayoutGroup): number | null {
  for (const { field } of group.fields) {
    if (field.kind !== 'richText' && field.senseIndex !== undefined) {
      return field.senseIndex + 1;
    }
  }
  return null;
}

// --- plain-text descriptions for the editor's compact lists -------------------------------------

/** A field's value as one line of plain text. */
export function fieldText(field: CardField): string {
  if (field.kind === 'richText') {
    return field
      .html()
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const { entry } = field;
  const sense = senseOf(field);
  const badges = (isKeyword: boolean | undefined, level: string | null | undefined) =>
    [isKeyword ? 'keyword' : null, level?.toUpperCase()].filter(Boolean).join(' · ');

  switch (field.kind) {
    case 'headword':
      return entry.headword;
    case 'partOfSpeech':
      return entry.partOfSpeech ?? '';
    case 'homographNumber':
      return entry.homographNumber ?? '';
    case 'hyphenation':
      return entry.hyphenation ?? '';
    case 'grammar':
      return entry.grammar ?? '';
    case 'pronunciation-british':
      return formatIpa(britishPhonetic(entry)?.ipa ?? '');
    case 'pronunciation-american':
      return formatIpa(americanPhonetic(entry)?.ipa ?? '');
    case 'keyword':
      return badges(entry.isKeyword, entry.keywordLevel);
    case 'frequencyLabels':
      return (entry.frequencyLabels ?? []).map((label) => label.code).join(' ');
    case 'inflectionForm':
      return inflectionOf(field)?.form ?? '';
    case 'senseImage':
      return sense?.imageUrl ?? '';
    case 'senseDefinition':
      return sense?.definition ?? '';
    case 'senseKeyword':
      return badges(sense?.isKeyword, sense?.cefrLevel);
    case 'senseSignpost':
      return sense?.signpost ?? '';
    case 'senseGrammar':
      return sense?.grammar ?? '';
    case 'senseRegister':
      return sense?.register ?? '';
    case 'sensePhrasalVerbPattern':
      return sense?.phrasalVerbPattern ?? '';
    case 'senseSynonyms':
      return (sense?.synonyms ?? []).join(', ');
    case 'senseAntonyms':
      return (sense?.antonyms ?? []).join(', ');
    case 'exampleHeader': {
      const group = exampleGroupOf(field);
      return group ? exampleGroupPhrase(group) : '';
    }
    case 'example':
      return (exampleOf(field)?.segments ?? []).map((segment) => segment.text).join('');
    case 'collocation':
      return collocationOf(field)?.phrase ?? '';
    case 'collocationExample':
      return collocationExampleOf(field) ?? '';
  }
}

/**
 * Where a field comes from: "Longman:Pronunciation (UK)", or "Longman:Entry 2:Pronunciation (UK)"
 * when that source returned several entries (homographs, parts of speech).
 */
export function sourcePath(field: EntryField, label = field.label): string {
  const entryPart =
    field.entryCount > 1 ? `${field.sourceLabel}:Entry ${field.entryOrdinal}` : field.sourceLabel;
  return `${entryPart}:${label}`;
}
