import { readState } from '../../card/card-state';
import { renderCardSide } from '../../card/render-card';
import type { CardSummary } from '../../core/anki/anki-notes';
import { restoreCard } from '../card-editor/card-layout';

/**
 * Whether a saved card's Front/Back still match what the current build renders from its State:
 * - `current`: nothing to do.
 * - `outdated`: saved before a rendering change - carries the fresh render to write back.
 * - `unavailable`: can't be rebuilt from its State as-is (missing/old data, or fields its stored
 *   search no longer has), so re-rendering would lose something - it's left to the editor.
 */
export type RenderStatus =
  | { kind: 'current' }
  | { kind: 'outdated'; language: string; front: string; back: string }
  | { kind: 'unavailable'; reason: string };

export function renderStatus({ fields }: CardSummary): RenderStatus {
  let state;
  try {
    state = readState(fields.state);
  } catch (error) {
    return { kind: 'unavailable', reason: (error as Error).message };
  }

  const card = restoreCard(state);
  if (card.dropped) {
    return {
      kind: 'unavailable',
      reason: `${card.dropped === 1 ? '1 saved field no longer matches' : `${card.dropped} saved fields no longer match`} the card’s stored search — open it in the editor to review.`,
    };
  }

  const front = renderCardSide(card.front);
  const back = renderCardSide(card.back);
  return sameHtml(front, fields.front) && sameHtml(back, fields.back)
    ? { kind: 'current' }
    : { kind: 'outdated', language: state.language, front, back };
}

// Anki's own editor rewrites a self-closing `<img ... />` as `<img ...>` when a note is edited
// there - the same card either way, so it mustn't count as a difference.
function sameHtml(rendered: string, stored: string): boolean {
  const normalize = (html: string) => html.replace(/\s*\/>/g, '>');
  return rendered === stored || normalize(rendered) === normalize(stored);
}
