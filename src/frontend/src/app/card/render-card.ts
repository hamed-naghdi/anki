import type {
  Collocation,
  PhoneticVariant,
  TextSegment,
} from '../core/dictionary/dictionary.models';
import {
  STACKED_KINDS,
  americanPhonetic,
  britishPhonetic,
  collocationExampleOf,
  collocationOf,
  exampleGroupOf,
  exampleGroupPhrase,
  exampleOf,
  examplePrefix,
  formatIpa,
  inflectionOf,
  isFrequencyDots,
  isNestedExample,
  senseNumber,
  senseOf,
  type CardField,
  type CardLayout,
  type LayoutGroup,
} from './card-field';

/**
 * Renders a card side as the self-contained HTML stored in Anki's Front/Back fields - and, since
 * it's the same HTML, the editor's live preview too, so the two can never drift apart.
 *
 * The markup only carries small, stable `pd-*` class names; all styling lives in card.css. That
 * split matters because Front/Back are baked into every note, while the note type's stylesheet can
 * be re-pushed to all existing cards at once: a card.css change restyles every card ever created
 * without touching a single note. So this file only changes when the *shape* of what's rendered
 * changes. Bump `--pd-style-version` in card.css whenever either file changes in a way that affects
 * the rendered card, so the next save re-pushes the styling.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Real audio/image URLs never contain quotes; percent-encode the few chars that would break out of
// a double-quoted attribute or a single-quoted JS string in an inline handler.
function attrUrl(url: string): string {
  return url.replace(/'/g, '%27').replace(/"/g, '%22').replace(/&/g, '&amp;');
}

function cefrBand(level: string): 'a' | 'b' | 'c' {
  const band = level.charAt(0).toLowerCase();
  return band === 'a' || band === 'b' ? band : 'c';
}

// An icon is a `pd-i` span that card.css fills from a CSS mask, rather than an inline SVG - so a
// card with a dozen audio buttons doesn't repeat a ~600-char path for each. `modifier` picks the
// size/colour (e.g. `uk`, `us`, `keyword`, `muted`).
function icon(name: 'volume-up' | 'key', modifier: string, title?: string): string {
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  return `<span class="pd-i pd-i-${name} pd-i-${modifier}" aria-hidden="true"${titleAttr}></span>`;
}

// Inline handler so playback works inside Anki's webview, where no app code runs. Stops
// propagation so a click inside a clickable container (e.g. a tree row) only plays the sound.
function playAudio(url: string): string {
  return `event.stopPropagation();new Audio('${attrUrl(url)}').play();return false;`;
}

function audioButton(url: string, accent: 'uk' | 'us', title?: string): string {
  const titleAttr = title ? ` title="${title}"` : '';
  const label = accent === 'uk' ? 'UK' : 'US';
  return `<button type="button" class="pd-audio-btn"${titleAttr} onclick="${playAudio(url)}">${icon('volume-up', accent)}${label}</button>`;
}

function pronunciation(variant: PhoneticVariant | null, accent: 'uk' | 'us'): string {
  if (!variant) return '';
  const title = accent === 'uk' ? 'Play British pronunciation' : 'Play American pronunciation';
  const audio = variant.audioUrl ? audioButton(variant.audioUrl, accent, title) : '';
  return `<span class="pd-pronunciation">${esc(formatIpa(variant.ipa))}${audio}</span>`;
}

// The compact form used inside an inflection form: `{ipa} [UK] [US]`.
function inflectionPronunciation(variant: PhoneticVariant, accent: 'uk' | 'us'): string {
  const audio = variant.audioUrl ? audioButton(variant.audioUrl, accent) : '';
  return `<span class="pd-inflection-ipa">${esc(formatIpa(variant.ipa))}${audio}</span>`;
}

function keywordBadges(
  isKeyword: boolean | undefined,
  level: string | null | undefined,
  keyTitle: string,
): string {
  const key = isKeyword ? icon('key', 'keyword', keyTitle) : '';
  const badge = level
    ? `<span class="pd-badge pd-badge-cefr pd-badge-cefr-${cefrBand(level)}" title="CEFR level">${esc(level)}</span>`
    : '';
  return key + badge;
}

function badge(text: string | null | undefined, modifier: string): string {
  return text ? `<span class="pd-badge pd-badge-${modifier}">${esc(text)}</span>` : '';
}

function relation(words: readonly string[], modifier: 'syn' | 'ant', label: string): string {
  if (!words.length) return '';
  return `<span class="pd-relation"><span class="pd-badge pd-badge-${modifier}">${label}</span><span class="pd-text">${esc(words.join(', '))}</span></span>`;
}

// Longman's own layout: "book an appointment BrE, schedule an appointment AmE (=make an
// appointment)", or "a doctor's appointment (also an appointment at the doctor's)".
function collocationHeading(collocation: Collocation): string {
  const geo = (text: string | null | undefined) => badge(text, 'geo');
  const variants = (collocation.variants ?? [])
    .map((variant) => {
      const phrase = `<span class="pd-example-phrase">${esc(variant.phrase)}</span>${geo(variant.geo)}`;
      return variant.linkWord
        ? `<span class="pd-collocation-variant pd-collocation-variant-linked">(<span class="pd-collocation-linkword">${esc(variant.linkWord)}</span> ${phrase})</span>`
        : `<span class="pd-collocation-variant">, ${phrase}</span>`;
    })
    .join('');
  const gloss = collocation.gloss
    ? `<span class="pd-example-note">(=${esc(collocation.gloss)})</span>`
    : '';
  return `<span class="pd-example-heading pd-collocation"><span class="pd-example-phrase">${esc(collocation.phrase)}</span>${geo(collocation.geo)}${variants}${gloss}</span>`;
}

// One example sentence: an audio button (or a bullet), an optional "pattern:" lead-in, the
// sentence with its emphasized collocates, and an optional note.
function exampleLine(
  segments: readonly TextSegment[],
  audioUrl: string | null | undefined,
  prefix: string | null,
  note: string | null | undefined,
  indent: boolean,
): string {
  const lead = audioUrl
    ? `<button type="button" class="pd-example-lead" title="Play example" onclick="${playAudio(audioUrl)}">${icon('volume-up', 'muted')}</button>`
    : `<span class="pd-example-lead pd-example-bullet" aria-hidden="true">&bull;</span>`;
  const pattern = prefix ? `<span class="pd-example-pattern">${esc(prefix)}:</span>` : '';
  const text = segments
    .map((segment) =>
      segment.isEmphasized
        ? `<span class="pd-example-emphasis">${esc(segment.text)}</span>`
        : `<span>${esc(segment.text)}</span>`,
    )
    .join('');
  const noteHtml = note ? `<span class="pd-example-note">${esc(note)}</span>` : '';
  const indentClass = indent ? ' pd-example-nested' : '';
  return `<span class="pd-example${indentClass}">${lead}<span class="pd-example-content"><span class="pd-example-text">${pattern}${text}</span>${noteHtml}</span></span>`;
}

export interface RenderFieldOptions {
  /** An example placed together with its collocation/grammar header: don't repeat the phrase. */
  readonly underHeader?: boolean;
  /** Indent such an example beneath its header. Defaults to `underHeader`. */
  readonly indent?: boolean;
}

/** One field's value on its own, with no "Label:" prefix. */
export function renderField(field: CardField, options: RenderFieldOptions = {}): string {
  if (field.kind === 'richText') {
    const rtlClass = field.direction === 'rtl' ? ' pd-rich-text-rtl' : '';
    // Intentionally raw, user-authored HTML - inserted as-is, exactly as Anki will show it.
    return `<div class="pd-rich-text${rtlClass}" dir="${field.direction}">${field.html()}</div>`;
  }

  const { entry } = field;
  const sense = senseOf(field);

  switch (field.kind) {
    case 'headword':
      return `<span class="pd-text">${esc(entry.headword)}</span>`;
    case 'partOfSpeech':
      return `<span class="pd-pos">${esc(entry.partOfSpeech ?? '')}</span>`;
    case 'homographNumber':
      return `<span class="pd-text">${esc(entry.homographNumber ?? '')}</span>`;
    case 'hyphenation':
      return `<span class="pd-hyphenation">${esc(entry.hyphenation ?? '')}</span>`;
    case 'grammar':
      return badge(entry.grammar, 'outline');
    case 'pronunciation-british':
      return pronunciation(britishPhonetic(entry), 'uk');
    case 'pronunciation-american':
      return pronunciation(americanPhonetic(entry), 'us');
    case 'keyword':
      return `<span class="pd-badge-group">${keywordBadges(entry.isKeyword, entry.keywordLevel, 'Oxford 3000/5000 keyword')}</span>`;
    case 'frequencyLabels': {
      const labels = (entry.frequencyLabels ?? []).map((label) => {
        const title = label.description ? ` title="${esc(label.description)}"` : '';
        return isFrequencyDots(label.code)
          ? `<span class="pd-freq-dots"${title}>${esc(label.code)}</span>`
          : `<span class="pd-badge pd-badge-freq"${title}>${esc(label.code)}</span>`;
      });
      return `<span class="pd-badge-group">${labels.join('')}</span>`;
    }
    case 'inflectionForm': {
      const form = inflectionOf(field);
      if (!form) return '';
      const label = field.label
        ? `<span class="pd-inflection-label">${esc(field.label)}:</span>`
        : '';
      const uk = form.pronunciation?.british[0];
      const us = form.pronunciation?.american[0];
      return (
        `<span class="pd-inflection">${label}<span class="pd-text">${esc(form.form)}</span>` +
        `${uk ? inflectionPronunciation(uk, 'uk') : ''}${us ? inflectionPronunciation(us, 'us') : ''}</span>`
      );
    }
    case 'senseImage': {
      if (!sense?.imageUrl) return '';
      const alt = sense.definition ?? entry.headword;
      return `<img src="${attrUrl(sense.imageUrl)}" alt="${esc(alt)}" class="pd-sense-image" />`;
    }
    case 'senseDefinition':
      return sense ? `<span class="pd-text">${esc(sense.definition ?? '')}</span>` : '';
    case 'senseKeyword':
      return sense
        ? `<span class="pd-badge-group pd-badge-group-raised">${keywordBadges(sense.isKeyword, sense.cefrLevel, 'Oxford 3000/5000 keyword sense')}</span>`
        : '';
    case 'senseSignpost':
      return badge(sense?.signpost, 'signpost');
    case 'senseGrammar':
      return badge(sense?.grammar, 'outline');
    case 'senseRegister':
      return badge(sense?.register, 'register');
    case 'sensePhrasalVerbPattern':
      return sense?.phrasalVerbPattern
        ? `<span class="pd-phrasal-pattern">${esc(sense.phrasalVerbPattern)}</span>`
        : '';
    case 'senseSynonyms':
      return relation(sense?.synonyms ?? [], 'syn', 'Syn');
    case 'senseAntonyms':
      return relation(sense?.antonyms ?? [], 'ant', 'Opp');
    case 'exampleHeader': {
      const group = exampleGroupOf(field);
      if (!group) return '';
      const glossary =
        group.sourceType === 'LongmanCollectionExample' && group.glossary
          ? `<span class="pd-example-note">${esc(group.glossary)}</span>`
          : '';
      return `<span class="pd-example-heading"><span class="pd-example-phrase">${esc(exampleGroupPhrase(group))}</span>${glossary}</span>`;
    }
    case 'example': {
      const example = exampleOf(field);
      if (!example) return '';
      const { underHeader = false, indent = underHeader } = options;
      const prefix = examplePrefix(field, underHeader);
      return exampleLine(example.segments, example.audioUrl, prefix, example.note, indent);
    }
    case 'collocation': {
      const collocation = collocationOf(field);
      return collocation ? collocationHeading(collocation) : '';
    }
    case 'collocationExample': {
      const sentence = collocationExampleOf(field);
      if (sentence === null) return '';
      const { underHeader = false, indent = underHeader } = options;
      // Away from its own collocation, the sentence keeps that phrase as its lead-in.
      const prefix = underHeader ? null : (collocationOf(field)?.phrase ?? null);
      return exampleLine([{ text: sentence }], null, prefix, null, indent);
    }
  }
}

// Inline items keep the headword/homograph/part of speech in their own typography; a sense
// definition flows as text, everything else sits in an inline-block.
function renderInlineItem(field: CardField): string {
  const wrapClass =
    field.kind === 'senseDefinition' ? 'pd-inline-item pd-inline-item-flow' : 'pd-inline-item';
  let inner: string;
  switch (field.kind) {
    case 'headword':
      inner = `<h2 class="pd-headword">${esc(field.entry.headword)}</h2>`;
      break;
    case 'homographNumber':
      inner = `<sup class="pd-homograph">${esc(field.entry.homographNumber ?? '')}</sup>`;
      break;
    case 'partOfSpeech':
      inner = `<span class="pd-pos pd-pos-muted">${esc(field.entry.partOfSpeech ?? '')}</span>`;
      break;
    default:
      inner = renderField(field);
  }
  return `<span class="${wrapClass}">${inner}</span>`;
}

function renderGroup(group: LayoutGroup): string {
  const fields = group.fields.map((placed) => placed.field);
  const inline = fields.filter((field) => !STACKED_KINDS.has(field.kind));
  const stacked = fields.filter((field) => STACKED_KINDS.has(field.kind));
  const number = senseNumber(group);

  const classes = ['pd-group'];
  if (fields.some((field) => field.kind === 'inflectionForm')) classes.push('pd-group-inflection');
  if (number !== null) classes.push('pd-group-numbered');

  const numberHtml = number !== null ? `<span class="pd-group-number">${number}</span>` : '';
  const inlineHtml = `<div class="pd-group-inline">${inline.map(renderInlineItem).join('')}</div>`;
  const stackedHtml = stacked.length
    ? `<div class="pd-group-stacked">${stacked
        .map(
          (field) =>
            `<div>${renderField(field, { underHeader: isNestedExample(fields, field) })}</div>`,
        )
        .join('')}</div>`
    : '';

  return `<div class="${classes.join(' ')}">${numberHtml}${inlineHtml}${stackedHtml}</div>`;
}

/** One card side, ready for an Anki Front/Back field. An empty side renders as an empty string. */
export function renderCardSide(layout: CardLayout): string {
  if (!layout.length) return '';
  return `<div class="pd-card"><div class="pd-groups">${layout.map(renderGroup).join('')}</div></div>`;
}
