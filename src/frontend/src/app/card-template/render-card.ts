import type { TreeNode } from 'primeng/api';
import {
  exampleGroupPhrase,
  isExampleGroup,
  type DictionaryEntry,
  type ExampleGroup,
  type PhoneticVariant,
  type SimpleExample,
} from '../core/dictionary-api';
import type { EntryFieldData, PlacedField, PlacedFieldData } from '../card-new/card-new';

/**
 * Renders a card side as a self-contained HTML string for Anki's Front / Back fields.
 *
 * This mirrors card-new.html's `#groupContent` / `#fieldChip` templates *structurally* (same
 * groups, same fields, same conditions) but NOT visually: the preview renders from Tailwind
 * utility classes, while this emits small, stable `pd-*` class names with all the actual styling
 * living in card.css. That split matters because Front/Back are baked HTML blobs stored per-note
 * (see AnkiModelService.addNote/updateNote) - only the shared note-type styling can be repushed to
 * every existing card at once. Utility classes baked into that HTML would freeze each note's look
 * at whatever render-card.ts produced when it was added; semantic classes mean a card.css edit
 * (bumping `--pd-style-version`) restyles every card ever created, without touching a single note.
 *
 * When you change what a group/field looks like, only card.css needs to change - this file only
 * needs to change when the *shape* of what's rendered changes (a new field kind, a new condition).
 * Bump `--pd-style-version` in card.css whenever either file changes in a way that affects the
 * rendered card, so the next "Add to Anki" re-pushes the styling.
 */

// Mirror of CardNew.STACKED_FIELD_KINDS - prose-like kinds that each get their own line rather
// than wrapping inline with the badges/tags.
const STACKED_KINDS: ReadonlySet<PlacedFieldData['kind']> = new Set<PlacedFieldData['kind']>([
  'inflectionForm',
  'exampleHeader',
  'example',
  'richText',
  'senseImage',
]);

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

// Mirror of CardNew.formatIpa.
function formatIpa(ipa: string): string {
  const inner = ipa.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return inner ? `/${inner}/` : '';
}

function primaryPronunciation(entry: DictionaryEntry) {
  return entry.pronunciations.find((p) => p.label == null) ?? entry.pronunciations[0] ?? null;
}

function britishPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
  return primaryPronunciation(entry)?.british[0] ?? null;
}

function americanPhonetic(entry: DictionaryEntry): PhoneticVariant | null {
  return primaryPronunciation(entry)?.american[0] ?? null;
}

function isFrequencyDots(code: string): boolean {
  return code.includes('●') || code.includes('○');
}

// Mirror of CardNew.cefrLevelClasses, translated to the CEFR band card.css keys off of.
function cefrLevelModifier(level: string): 'a' | 'b' | 'c' {
  switch (level.charAt(0).toLowerCase()) {
    case 'a':
      return 'a';
    case 'b':
      return 'b';
    default:
      return 'c';
  }
}

function senseOf(field: EntryFieldData) {
  return field.senseIndex !== undefined ? (field.entry.senses[field.senseIndex] ?? null) : null;
}

// The collocation/grammar group an 'exampleHeader' or nested 'example' belongs to.
export function exampleGroupOf(field: EntryFieldData): ExampleGroup | null {
  if (field.exampleIndex === undefined) return null;
  const example = senseOf(field)?.examples[field.exampleIndex];
  return example && isExampleGroup(example) ? example : null;
}

// The sentence an 'example' leaf points at - either a plain example, or one nested in a group.
export function exampleOf(field: EntryFieldData): SimpleExample | null {
  if (field.exampleIndex === undefined) return null;
  const example = senseOf(field)?.examples[field.exampleIndex];
  if (!example) return null;
  if (!isExampleGroup(example)) return example;
  return field.subExampleIndex !== undefined
    ? (example.examples?.[field.subExampleIndex] ?? null)
    : null;
}

/**
 * Whether `field` is a nested example whose own group header also sits in `fields` (one card
 * group) - it then renders indented under that header instead of repeating the phrase itself.
 */
export function isNestedExample(
  fields: readonly PlacedFieldData[],
  field: PlacedFieldData,
): boolean {
  if (field.kind !== 'example' || field.subExampleIndex === undefined) return false;
  return fields.some(
    (other) =>
      other.kind === 'exampleHeader' &&
      other.entryKey === field.entryKey &&
      other.senseIndex === field.senseIndex &&
      other.exampleIndex === field.exampleIndex,
  );
}

// The "pattern:" lead-in printed before an example's sentence: Oxford's own per-example pattern,
// or - for a nested Longman example placed away from its header - that group's phrase, so the
// example doesn't lose the context it illustrates.
export function examplePrefix(field: EntryFieldData, nested: boolean): string | null {
  const own = exampleOf(field)?.pattern;
  if (own) return own;
  if (nested || field.subExampleIndex === undefined) return null;
  const group = exampleGroupOf(field);
  return group ? exampleGroupPhrase(group) || null : null;
}

function inflectionOf(field: EntryFieldData) {
  return field.formIndex !== undefined
    ? (field.entry.inflectionForms[field.formIndex] ?? null)
    : null;
}

// The preview renders these as inline primeicons `<svg>`s; here they're a `pd-i pd-i-<name>` span
// that card.css fills from a CSS mask (see card.css) - so a card with a dozen audio buttons carries
// ~30 chars each instead of the ~600-char SVG path repeated. `modifier` picks the size/colour from
// card.css (e.g. `uk`, `us`, `key`, `muted`) instead of carrying utility classes.
function icon(name: 'volume-up' | 'key', modifier: string, title?: string): string {
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  return `<span class="pd-i pd-i-${name} pd-i-${modifier}" aria-hidden="true"${titleAttr}></span>`;
}

// Mirror of CardNew.playAudio: play a remote clip, swallow the click. Works in Anki's webview too.
function playAudio(url: string): string {
  return `event.stopPropagation();new Audio('${attrUrl(url)}').play();return false;`;
}

function pronunciationAudioButton(url: string, side: 'uk' | 'us'): string {
  const label = side === 'uk' ? 'UK' : 'US';
  const title = side === 'uk' ? 'Play British pronunciation' : 'Play American pronunciation';
  return (
    `<button type="button" class="pd-audio-btn" title="${title}" onclick="${playAudio(url)}">` +
    `${icon('volume-up', side)}${label}</button>`
  );
}

// Compact pronunciation used inside an inflection form: `{ipa} [UK] [US]`, no title on the buttons.
function inflectionPronunciation(variant: PhoneticVariant, side: 'uk' | 'us'): string {
  const label = side === 'uk' ? 'UK' : 'US';
  const audio = variant.audioUrl
    ? `<button type="button" class="pd-audio-btn" onclick="${playAudio(variant.audioUrl)}">${icon('volume-up', side)}${label}</button>`
    : '';
  return `<span class="pd-inflection-ipa">${esc(formatIpa(variant.ipa))}${audio}</span>`;
}

function keywordBadges(
  isKeyword: boolean | undefined,
  level: string | null | undefined,
  keyTitle: string,
): string {
  const key = isKeyword ? icon('key', 'keyword', keyTitle) : '';
  const badge = level
    ? `<span class="pd-badge pd-badge-cefr pd-badge-cefr-${cefrLevelModifier(level)}" title="CEFR level">${esc(level)}</span>`
    : '';
  return key + badge;
}

// Mirror of the #fieldChip template's @switch - the value of a single field, no "Label:" prefix.
// `nested` is isNestedExample's answer for this field within its group.
function renderChip(field: PlacedFieldData, nested = false): string {
  switch (field.kind) {
    case 'headword':
      return `<span class="pd-text">${esc(field.entry.headword)}</span>`;
    case 'partOfSpeech':
      return `<span class="pd-pos">${esc(field.entry.partOfSpeech ?? '')}</span>`;
    case 'homographNumber':
      return `<span class="pd-text">${esc(field.entry.homographNumber ?? '')}</span>`;
    case 'hyphenation':
      return `<span class="pd-hyphenation">${esc(field.entry.hyphenation ?? '')}</span>`;
    case 'grammar':
      return `<span class="pd-badge pd-badge-outline">${esc(field.entry.grammar ?? '')}</span>`;
    case 'pronunciation-british': {
      const uk = britishPhonetic(field.entry);
      if (!uk) return '';
      const audio = uk.audioUrl ? pronunciationAudioButton(uk.audioUrl, 'uk') : '';
      return `<span class="pd-pronunciation">${esc(formatIpa(uk.ipa))}${audio}</span>`;
    }
    case 'pronunciation-american': {
      const us = americanPhonetic(field.entry);
      if (!us) return '';
      const audio = us.audioUrl ? pronunciationAudioButton(us.audioUrl, 'us') : '';
      return `<span class="pd-pronunciation">${esc(formatIpa(us.ipa))}${audio}</span>`;
    }
    case 'keyword':
      return `<span class="pd-badge-group">${keywordBadges(field.entry.isKeyword, field.entry.keywordLevel, 'Oxford 3000/5000 keyword')}</span>`;
    case 'frequencyLabels': {
      const labels = field.entry.frequencyLabels ?? [];
      const inner = labels
        .map((label) => {
          const title = label.description ? ` title="${esc(label.description)}"` : '';
          return isFrequencyDots(label.code)
            ? `<span class="pd-freq-dots"${title}>${esc(label.code)}</span>`
            : `<span class="pd-badge pd-badge-freq"${title}>${esc(label.code)}</span>`;
        })
        .join('');
      return `<span class="pd-badge-group">${inner}</span>`;
    }
    case 'inflectionForm': {
      const form = inflectionOf(field);
      if (!form) return '';
      const label = field.label ? `<span class="pd-inflection-label">${esc(field.label)}:</span>` : '';
      const uk = form.pronunciation?.british?.[0];
      const us = form.pronunciation?.american?.[0];
      return (
        `<span class="pd-inflection">${label}` +
        `<span class="pd-text">${esc(form.form)}</span>` +
        `${uk ? inflectionPronunciation(uk, 'uk') : ''}${us ? inflectionPronunciation(us, 'us') : ''}</span>`
      );
    }
    case 'senseImage': {
      const sense = senseOf(field);
      if (!sense?.imageUrl) return '';
      const alt = sense.definition ?? field.entry.headword;
      return `<img src="${attrUrl(sense.imageUrl)}" alt="${esc(alt)}" class="pd-sense-image" />`;
    }
    case 'senseDefinition': {
      const sense = senseOf(field);
      return sense ? `<span class="pd-text">${esc(sense.definition ?? '')}</span>` : '';
    }
    case 'senseKeyword': {
      const sense = senseOf(field);
      if (!sense) return '';
      return `<span class="pd-badge-group pd-badge-group-raised">${keywordBadges(sense.isKeyword, sense.cefrLevel, 'Oxford 3000/5000 keyword sense')}</span>`;
    }
    case 'senseSignpost': {
      const signpost = senseOf(field)?.signpost;
      return signpost ? `<span class="pd-badge pd-badge-signpost">${esc(signpost)}</span>` : '';
    }
    case 'senseGrammar': {
      const grammar = senseOf(field)?.grammar;
      return grammar ? `<span class="pd-badge pd-badge-outline">${esc(grammar)}</span>` : '';
    }
    case 'senseRegister': {
      const register = senseOf(field)?.register;
      return register ? `<span class="pd-badge pd-badge-register">${esc(register)}</span>` : '';
    }
    case 'sensePhrasalVerbPattern': {
      const pattern = senseOf(field)?.phrasalVerbPattern;
      return pattern ? `<span class="pd-phrasal-pattern">${esc(pattern)}</span>` : '';
    }
    case 'senseSynonyms': {
      const sense = senseOf(field);
      if (!sense?.synonyms.length) return '';
      return `<span class="pd-relation"><span class="pd-badge pd-badge-syn">Syn</span><span class="pd-text">${esc(sense.synonyms.join(', '))}</span></span>`;
    }
    case 'senseAntonyms': {
      const sense = senseOf(field);
      if (!sense?.antonyms.length) return '';
      return `<span class="pd-relation"><span class="pd-badge pd-badge-ant">Opp</span><span class="pd-text">${esc(sense.antonyms.join(', '))}</span></span>`;
    }
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
      const lead = example.audioUrl
        ? `<button type="button" class="pd-example-lead" title="Play example" onclick="${playAudio(example.audioUrl)}">${icon('volume-up', 'muted')}</button>`
        : `<span class="pd-example-lead pd-example-bullet" aria-hidden="true">&bull;</span>`;
      const prefix = examplePrefix(field, nested);
      const pattern = prefix ? `<span class="pd-example-pattern">${esc(prefix)}:</span>` : '';
      const nestedClass = nested ? ' pd-example-nested' : '';
      const text = example.segments
        .map((segment) =>
          segment.isEmphasized
            ? `<span class="pd-example-emphasis">${esc(segment.text)}</span>`
            : `<span>${esc(segment.text)}</span>`,
        )
        .join('');
      const note = example.note ? `<span class="pd-example-note">${esc(example.note)}</span>` : '';
      return `<span class="pd-example${nestedClass}">${lead}<span class="pd-example-content"><span class="pd-example-text">${pattern}${text}</span>${note}</span></span>`;
    }
    case 'richText': {
      const rtlClass = field.direction === 'rtl' ? ' pd-rich-text-rtl' : '';
      // Intentionally raw, user-authored HTML - inserted as-is, same as the preview's [innerHTML].
      return `<div class="pd-rich-text${rtlClass}" dir="${field.direction}">${field.html()}</div>`;
    }
  }
}

// Mirror of #groupContent's inline row: headword/homograph/part of speech keep their own typography,
// everything else goes through renderChip; the wrapper stays inline for a sense definition so it
// flows as text, inline-block otherwise.
function renderInlineItem(field: PlacedFieldData): string {
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
      inner = renderChip(field);
  }
  return `<span class="${wrapClass}">${inner}</span>`;
}

function placedFields(group: TreeNode): PlacedFieldData[] {
  return (group.children ?? []).map((child) => (child.data as PlacedField).field);
}

// Mirror of CardNew.senseNumberFor.
function senseNumber(group: TreeNode): number | null {
  const field = placedFields(group).find(
    (candidate) => (candidate as EntryFieldData).senseIndex !== undefined,
  ) as EntryFieldData | undefined;
  return field?.senseIndex !== undefined ? field.senseIndex + 1 : null;
}

function renderGroup(group: TreeNode): string {
  const fields = placedFields(group);
  const inline = fields.filter((field) => !STACKED_KINDS.has(field.kind));
  const stacked = fields.filter((field) => STACKED_KINDS.has(field.kind));
  const number = senseNumber(group);
  const isInflection = fields.some((field) => field.kind === 'inflectionForm');

  const cls = ['pd-group'];
  if (isInflection) cls.push('pd-group-inflection');
  if (number !== null) cls.push('pd-group-numbered');

  const numberHtml = number !== null ? `<span class="pd-group-number">${number}</span>` : '';
  const inlineHtml = `<div class="pd-group-inline">${inline.map(renderInlineItem).join('')}</div>`;
  const stackedHtml = stacked.length
    ? `<div class="pd-group-stacked">${stacked.map((field) => `<div>${renderChip(field, isNestedExample(fields, field))}</div>`).join('')}</div>`
    : '';

  return `<div class="${cls.join(' ')}">${numberHtml}${inlineHtml}${stackedHtml}</div>`;
}

/** One card side, ready to drop into an Anki `Front` / `Back` field. Empty groups -> empty string. */
export function renderCardSide(groups: readonly TreeNode[]): string {
  if (!groups.length) return '';
  const inner = groups.map(renderGroup).join('');
  return `<div class="pd-card"><div class="pd-groups">${inner}</div></div>`;
}
