import { makeSearch } from '../../../testing/dictionary-fixtures';
import { encodeState, type CardState } from '../../card/card-state';
import { renderCardSide } from '../../card/render-card';
import type { CardSummary } from '../../core/anki/anki-notes';
import { restoreCard } from '../card-editor/card-layout';
import { renderStatus } from './render-status';

const state: CardState = {
  v: 1,
  language: 'en',
  word: 'make',
  sources: ['Longman'],
  search: makeSearch,
  front: [
    {
      key: 'g1',
      fields: [
        { t: 'entry', instanceKey: 'Longman-0-headword', isCopy: false, key: 'Longman-0-headword' },
      ],
    },
  ],
  back: [
    {
      key: 'g2',
      fields: [
        {
          t: 'entry',
          instanceKey: 'Longman-0-pronunciation-british',
          isCopy: false,
          key: 'Longman-0-pronunciation-british',
        },
        {
          t: 'rich',
          instanceKey: 'rich-1',
          isCopy: false,
          html: 'my note <img src="a.png" />',
          direction: 'ltr',
        },
      ],
    },
  ],
};

function summary(front: string, back: string, cardState: CardState | string = state): CardSummary {
  return {
    noteId: 1,
    word: 'make',
    deck: 'English',
    flag: 0,
    editable: true,
    fields: {
      front,
      back,
      state: typeof cardState === 'string' ? cardState : encodeState(cardState),
    },
  };
}

const restored = restoreCard(state);
const front = renderCardSide(restored.front);
const back = renderCardSide(restored.back);

describe('renderStatus', () => {
  it('is current when the stored sides match a fresh render', () => {
    expect(renderStatus(summary(front, back))).toEqual({ kind: 'current' });
  });

  it('ignores Anki rewriting a self-closing tag', () => {
    expect(renderStatus(summary(front, back.replace(' />', '>')))).toEqual({ kind: 'current' });
  });

  it('is outdated, with the fresh render, when a stored side differs', () => {
    expect(renderStatus(summary(front, back.replace('pd-inline-item-line', '')))).toEqual({
      kind: 'outdated',
      language: 'en',
      front,
      back,
    });
  });

  it('is unavailable without saved state, or with state from another version', () => {
    expect(renderStatus(summary(front, back, ''))).toMatchObject({ kind: 'unavailable' });
    expect(renderStatus(summary(front, back, { ...state, v: 99 }))).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('v99'),
    });
  });

  it('is unavailable when saved fields no longer resolve, rather than dropping them', () => {
    const lost: CardState = {
      ...state,
      front: [
        { key: 'g1', fields: [{ t: 'entry', instanceKey: 'gone', isCopy: false, key: 'gone' }] },
      ],
    };
    expect(renderStatus(summary('', back, lost))).toEqual({
      kind: 'unavailable',
      reason: expect.stringContaining('1 saved field no longer matches'),
    });
  });
});
