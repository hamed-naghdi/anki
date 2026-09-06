/**
 * Client for this app's own backend (Dictionary.Api), which looks a word up across one or more
 * dictionary sources (Longman, Oxford, ...) in parallel and returns each source's contribution
 * separately - unlike AnkiConnect, this goes through our own server, not a local Anki add-on.
 */
export const DICTIONARY_API_URL = 'http://localhost:5000';

/** A language the dictionary sources below can be grouped under. */
export interface LanguageOption {
  readonly key: string;
  readonly label: string;
  readonly disabled?: boolean;
}

// German has no dictionary sources wired up yet, so it's listed (for visibility of what's coming)
// but disabled rather than omitted.
export const LANGUAGES: readonly LanguageOption[] = [
  { key: 'en', label: 'En' },
  { key: 'de', label: 'De', disabled: true },
];

/** A dictionary source the lookup endpoint can query, keyed by its `sources` query param value. */
export interface DictionarySourceOption {
  readonly key: string;
  readonly label: string;
  readonly language: string;
}

// Only English sources exist today; German entries would go here once that source is available.
export const DICTIONARY_SOURCES: readonly DictionarySourceOption[] = [
  { key: 'longman', label: 'Longman', language: 'en' },
  { key: 'oxford', label: 'Oxford', language: 'en' },
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
  /** A collocation/grammar pattern this example illustrates (e.g. "buy somebody something") - provider-specific extra, kept here the same way homographNumber/frequencyLabels are on DictionaryEntry. */
  pattern?: string | null;
}

export interface DictionarySense {
  definition: string | null;
  grammar: string | null;
  register: string | null;
  synonyms: string[];
  antonyms: string[];
  examples: DictionaryExample[];
  /** This sense's own CEFR level (Oxford-only), independent of the entry-level keyword level. */
  cefrLevel?: string | null;
  /** Whether this specific sense is flagged as an Oxford 3000/5000 keyword sense. */
  isKeyword?: boolean;
  /** Illustration Longman prints at the top of this sense (e.g. "frying pan"), null for the vast majority of senses, which have none. */
  imageUrl?: string | null;
}

/** A short vocabulary badge with a human-readable explanation, e.g. Longman's frequency dots ("●●○") or S1/W1 top-1000-word markers. */
export interface UsageLabel {
  code: string;
  description: string | null;
}

/**
 * Common shape every provider's entry serializes to. `homographNumber`/`frequencyLabels` (Longman)
 * and `isKeyword`/`keywordLevel` (Oxford) are provider-only extras the backend happens to still
 * send on this shared shape (other providers just omit them), kept here rather than on separate
 * per-provider types since the tree node template renders sources generically and reads them
 * defensively.
 */
export interface DictionaryEntry {
  provider: string;
  /** The actual headword this entry is for, as the source printed it - can differ from the searched term (e.g. a multi-word search with no entry of its own, where the source fell back to a related single word). */
  headword: string;
  partOfSpeech: string | null;
  grammar: string | null;
  pronunciations: Pronunciation[];
  inflectionForms: InflectionForm[];
  senses: DictionarySense[];
  homographNumber?: string | null;
  /** Syllable-divided spelling (Longman, e.g. "cu‧ri‧os‧i‧ty"), or a phrasal verb's object-placement pattern in that same slot (both providers, e.g. "cross something ↔ out/through"). */
  hyphenation?: string | null;
  frequencyLabels?: UsageLabel[];
  /** Whether the headword is in the Oxford 3000/5000 keyword list. */
  isKeyword?: boolean;
  /** CEFR level associated with the keyword-list membership above (e.g. "a1", "c1"). */
  keywordLevel?: string | null;
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
