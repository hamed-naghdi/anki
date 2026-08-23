/**
 * Client for this app's own backend (Dictionary.Api), which looks a word up across one or more
 * dictionary sources (Longman, Oxford, ...) in parallel and returns each source's contribution
 * separately - unlike AnkiConnect, this goes through our own server, not a local Anki add-on.
 */
export const DICTIONARY_API_URL = 'http://localhost:5000';

/** A dictionary source the lookup endpoint can query, keyed by its `sources` query param value. */
export interface DictionarySourceOption {
  readonly key: string;
  readonly label: string;
}

// Only English sources exist today; a language switch (e.g. German) would add more entries here.
export const DICTIONARY_SOURCES: readonly DictionarySourceOption[] = [
  { key: 'longman', label: 'Longman' },
  { key: 'oxford', label: 'Oxford' },
];

export interface PhoneticVariant {
  ipa: string;
  audioUrl: string | null;
}

export interface Pronunciation {
  label: string | null;
  british: PhoneticVariant[];
  american: PhoneticVariant[];
}

export interface InflectionForm {
  label: string | null;
  form: string;
  pronunciation: Pronunciation | null;
}

export interface TextSegment {
  text: string;
  isEmphasized: boolean;
}

export interface DictionaryExample {
  segments: TextSegment[];
  audioUrl: string | null;
  note: string | null;
}

export interface DictionarySense {
  definition: string | null;
  grammar: string | null;
  register: string | null;
  synonyms: string[];
  antonyms: string[];
  examples: DictionaryExample[];
}

/** Common shape every provider's entry serializes to; provider-specific extras are omitted. */
export interface DictionaryEntry {
  provider: string;
  partOfSpeech: string | null;
  grammar: string | null;
  pronunciations: Pronunciation[];
  inflectionForms: InflectionForm[];
  senses: DictionarySense[];
}

export interface DictionarySourceResult {
  source: string;
  entries: DictionaryEntry[];
  error: string | null;
}

export interface DictionarySearchResult {
  word: string;
  results: DictionarySourceResult[];
}

/** Builds an httpResource-compatible request for the multi-dictionary lookup endpoint. */
export function dictionaryLookupRequest(word: string, sources: readonly string[]) {
  return {
    url: `${DICTIONARY_API_URL}/api/dictionaries/lookup/${encodeURIComponent(word)}`,
    params: { sources: [...sources] },
  };
}
