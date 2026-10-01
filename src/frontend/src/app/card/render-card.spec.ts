import { makeSearch } from '../../testing/dictionary-fixtures';
import { buildResultTrees, collectFields } from '../features/card-editor/results-tree';
import type { CardLayout, PlacedField } from './card-field';
import { renderCardSide, renderField } from './render-card';

const fields = collectFields(buildResultTrees(makeSearch).values());
const place = (key: string): PlacedField => ({
  instanceKey: key,
  field: fields.get(key)!,
  isCopy: false,
});

describe('renderCardSide', () => {
  it('renders nothing for an empty side', () => {
    expect(renderCardSide([])).toBe('');
  });

  it('indents an example under its own collocation header, without repeating the phrase', () => {
    const layout: CardLayout = [
      {
        key: 'g',
        fields: [
          place('Longman-0-sense-0-example-2-header'),
          place('Longman-0-sense-0-example-2-0'),
        ],
      },
    ];
    const html = renderCardSide(layout);
    expect(html).toContain('<span class="pd-example-phrase">make a hole</span>');
    expect(html).toContain('<span class="pd-example-note">damage it</span>');
    expect(html).toContain('class="pd-example pd-example-nested"');
    expect(html).not.toContain('pd-example-pattern');
    expect(html).toContain('<span class="pd-group-number">1</span>');
  });

  it('prefixes a nested example placed without its header with the group phrase', () => {
    const html = renderCardSide([{ key: 'g', fields: [place('Longman-0-sense-0-example-1-0')] }]);
    expect(html).toContain('<span class="pd-example-pattern">make somebody something:</span>');
    expect(html).not.toContain('pd-example-nested');
  });

  it('escapes dictionary text but keeps user-authored rich text raw', () => {
    const entry = fields.get('Longman-0-headword')!;
    const tricky = { ...entry, entry: { ...entry.entry, headword: '<b>"x"</b>' } };
    expect(renderField(tricky)).toBe(
      '<span class="pd-text">&lt;b&gt;&quot;x&quot;&lt;/b&gt;</span>',
    );
  });
});
