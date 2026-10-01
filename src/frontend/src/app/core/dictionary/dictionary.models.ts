/**
 * The JSON shapes this app's own backend (Dictionary.Api) returns from its lookup endpoint.
 *
 * The backend omits default values (null, false, 0) from its JSON, so every optional field below
 * can arrive as `undefined` rather than `null` - test them for truthiness or `== null`, never
 * `=== null`.
 */

export interface PhoneticVariant {
  ipa: string;
  audioUrl?: string | null;
}

export interface Pronunciation {
  label?: string | null;
  british: PhoneticVariant[];
  american: PhoneticVariant[];
}

export interface InflectionForm {
  label?: string | null;
  form: string;
  pronunciation?: Pronunciation | null;
}

export interface TextSegment {
  text: string;
  isEmphasized?: boolean;
}

/**
 * A single example sentence. `sourceType` is missing on cards saved before the backend started
 * tagging examples - those were always this plain shape (Longman's then carried `pattern`/`note`
 * here too), so a missing tag means "simple example".
 */
export interface SimpleExample {
  sourceType?: 'LongmanExample' | 'OxfordExample';
  segments: TextSegment[];
  audioUrl?: string | null;
  note?: string | null;
  /** A collocation/grammar pattern this example illustrates (e.g. "buy somebody something") - Oxford only now; Longman groups these instead (see below). */
  pattern?: string | null;
}

/** Longman's bold collocation (e.g. "make a hole/dent/mark etc") with the examples that illustrate it. */
export interface LongmanCollocationExample {
  sourceType: 'LongmanCollectionExample';
  collection: string;
  glossary?: string | null;
  examples?: SimpleExample[];
}

/** Longman's grammar pattern (e.g. "make somebody something") with the examples that illustrate it. */
export interface LongmanGrammarExample {
  sourceType: 'LongmanGrammarExample';
  pattern: string;
  examples?: SimpleExample[];
}

export type ExampleGroup = LongmanCollocationExample | LongmanGrammarExample;

export type DictionaryExample = SimpleExample | ExampleGroup;

export function isExampleGroup(example: DictionaryExample): example is ExampleGroup {
  return (
    example.sourceType === 'LongmanCollectionExample' ||
    example.sourceType === 'LongmanGrammarExample'
  );
}

export interface DictionarySense {
  definition?: string | null;
  grammar?: string | null;
  register?: string | null;
  synonyms: string[];
  antonyms: string[];
  examples: DictionaryExample[];
  /** This sense's own CEFR level (Oxford-only), independent of the entry-level keyword level. */
  cefrLevel?: string | null;
  /** Whether this specific sense is flagged as an Oxford 3000/5000 keyword sense. */
  isKeyword?: boolean;
  /** Illustration Longman prints at the top of this sense (e.g. "frying pan"), null for the vast majority of senses, which have none. */
  imageUrl?: string | null;
  /** Longman-only short italic gloss right after a guideword (e.g. "separate into pieces"), grouping a set of sub-senses under a broader meaning. Null when this sense has none. */
  signpost?: string | null;
  /** A phrasal verb sense's own object-placement pattern (e.g. "look something ↔ up"), printed right before the definition. Null for a non-phrasal sense. */
  phrasalVerbPattern?: string | null;
}

/** A short vocabulary badge with a human-readable explanation, e.g. Longman's frequency dots ("●●○") or S1/W1 top-1000-word markers. */
export interface UsageLabel {
  code: string;
  description?: string | null;
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
  partOfSpeech?: string | null;
  grammar?: string | null;
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
  error?: string | null;
}

export interface DictionarySearchResult {
  word: string;
  results: DictionarySourceResult[];
}
