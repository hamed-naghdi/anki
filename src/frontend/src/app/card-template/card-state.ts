import type { DictionarySearchResult } from '../core/dictionary-api';

/**
 * The editor state stashed in each note's hidden `State` field so a card can be reopened in
 * card-new and edited. It carries the resolved dictionary search *and* the ordered layout of both
 * sides, so re-editing needs no network call and can't drift if a dictionary site changes.
 *
 * Bump CARD_STATE_VERSION when this shape changes incompatibly - older cards then refuse to load
 * for editing (with a message telling the user to re-create them) rather than hydrating wrongly.
 */
export const CARD_STATE_VERSION = 1;

/** One placed field, referenced back to the results tree by its leaf key. */
export interface SerializedEntryField {
  t: 'entry';
  instanceKey: string;
  isCopy: boolean;
  /** The results-tree leaf key this field resolves from (e.g. "longman-0-sense-1-example-2"). */
  key: string;
}

/** A user-authored rich-text block - stored by value, it isn't tied to the results tree. */
export interface SerializedRichField {
  t: 'rich';
  instanceKey: string;
  isCopy: boolean;
  html: string;
  direction: 'rtl' | 'ltr';
}

export type SerializedField = SerializedEntryField | SerializedRichField;

export interface SerializedGroup {
  key: string;
  fields: SerializedField[];
}

export interface CardState {
  v: number;
  language: string;
  word: string;
  sources: string[];
  search: DictionarySearchResult;
  front: SerializedGroup[];
  back: SerializedGroup[];
}

// Stored base64 so the JSON never has to survive Anki treating the field as HTML.
export function encodeState(state: CardState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeState(raw: string): CardState {
  const cleaned = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as CardState;
}
