import { LANGUAGES } from '../core/dictionary-api';

/**
 * The app owns one Anki note type per language - "En-Dictionary", later "De-Dictionary" - so each
 * language's card styling can diverge without touching the others.
 *
 * `Front`/`Back` are pre-rendered HTML blobs from render-card.ts - nothing to edit per-field in
 * Anki's own editor. `State` is a hidden field (the card templates never render it) holding the
 * base64 editor state (see card-state.ts) so the card can be reopened and edited in card-new.
 */
export const MODEL_FIELDS = ['Front', 'Back', 'State'] as const;

const FRONT_TEMPLATE = '{{Front}}';
const BACK_TEMPLATE = '{{FrontSide}}\n<hr id="answer">\n{{Back}}';

/** Shape `createModel` wants. */
export const CARD_TEMPLATES = [{ Name: 'Card 1', Front: FRONT_TEMPLATE, Back: BACK_TEMPLATE }];

/** Shape `updateModelTemplates` wants (keyed by card name). */
export const CARD_TEMPLATE_MAP: Record<string, { Front: string; Back: string }> = {
  'Card 1': { Front: FRONT_TEMPLATE, Back: BACK_TEMPLATE },
};

/** e.g. "en" -> "En-Dictionary". Falls back to the upper-cased key for an unknown language. */
export function dictionaryModelName(languageKey: string): string {
  const label =
    LANGUAGES.find((language) => language.key === languageKey)?.label ?? languageKey.toUpperCase();
  return `${label}-Dictionary`;
}

/**
 * The `--pd-style-version` marker card.css puts on `.pd-card`, read back out of a stylesheet.
 * AnkiModelService compares the version compiled into the app against the one stored in Anki to
 * decide whether "Add to Anki" should re-push the styling and templates.
 */
export function parseStyleVersion(css: string): number | null {
  const match = css.match(/--pd-style-version:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}
