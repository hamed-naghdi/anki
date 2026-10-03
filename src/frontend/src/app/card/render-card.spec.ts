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

  it('renders a collocation with its region, variant and gloss, examples nested under it', () => {
    const html = renderCardSide([
      {
        key: 'g',
        fields: [
          place('Longman-0-collocation-0-0-0'),
          place('Longman-0-collocation-0-0-0-example-1'),
        ],
      },
    ]);
    expect(html).toContain('<span class="pd-example-phrase">book an appointment</span>');
    expect(html).toContain('<span class="pd-badge pd-badge-geo">British English</span>');
    expect(html).toContain(
      '<span class="pd-collocation-variant">, <span class="pd-example-phrase">schedule an appointment</span><span class="pd-badge pd-badge-geo">American English</span></span>',
    );
    expect(html).toContain('<span class="pd-example-note">(=make an appointment)</span>');
    expect(html).toContain('class="pd-example pd-example-nested"');
    expect(html).toContain('I’ve scheduled it for 9.30.');
    expect(html).not.toContain('pd-example-pattern');
  });

  it('shows an "also" variant in brackets', () => {
    const html = renderCardSide([{ key: 'g', fields: [place('Longman-0-collocation-0-0-1')] }]);
    expect(html).toContain(
      '(<span class="pd-collocation-linkword">also</span> <span class="pd-example-phrase">an appointment at the doctor’s</span>)',
    );
  });

  it('prefixes a collocation example placed without its phrase', () => {
    const html = renderCardSide([
      { key: 'g', fields: [place('Longman-0-collocation-0-0-0-example-0')] },
    ]);
    expect(html).toContain('<span class="pd-example-pattern">book an appointment:</span>');
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
