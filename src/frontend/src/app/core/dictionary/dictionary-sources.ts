/** A language the dictionary sources below are grouped under. */
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

export const DEFAULT_LANGUAGE = 'en';

/** A dictionary source the lookup endpoint can query, keyed by its `sources` query param value. */
export interface DictionarySourceOption {
  readonly key: string;
  readonly label: string;
  readonly language: string;
}

export const DICTIONARY_SOURCES: readonly DictionarySourceOption[] = [
  { key: 'longman', label: 'Longman', language: 'en' },
  { key: 'oxford', label: 'Oxford', language: 'en' },
];

export function sourcesForLanguage(language: string): DictionarySourceOption[] {
  return DICTIONARY_SOURCES.filter((source) => source.language === language);
}

export function languageLabel(language: string): string {
  return LANGUAGES.find((option) => option.key === language)?.label ?? language.toUpperCase();
}
