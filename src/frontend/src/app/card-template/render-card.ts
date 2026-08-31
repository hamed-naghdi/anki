import type { TreeNode } from 'primeng/api';
import type { DictionaryEntry, PhoneticVariant } from '../core/dictionary-api';
import type { EntryFieldData, PlacedField, PlacedFieldData } from '../card-new/card-new';

/**
 * Renders a card side as a self-contained HTML string for Anki's Front / Back fields.
 *
 * This is a hand-kept MIRROR of card-new.html's `#groupContent` and `#fieldChip` templates: same
 * markup and the same Tailwind class strings (written as literals so `@source './render-card.ts'`
 * in card.css picks them up). The in-app preview keeps rendering from those Angular templates -
 * this exists only because that markup leans on the app's Tailwind build and PrimeNG theme, neither
 * of which exists inside Anki's webview.
 *
 * Three deliberate departures from the templates: the primeicons `<svg>`s become `pd-i` spans that
 * card.css fills from a CSS mask (keeps a card with many audio buttons small), and the example row
 * uses `items-baseline` + `-mb-px` on the lead instead of `items-start` + `mt-0.5` (the speaker was
 * sitting a few px low). The `#fieldChip` template carries the same example-alignment fix. The
 * stacked-fields gap (renderGroup's stackedHtml) is tighter here than in #groupContent - the wider
 * gap reads fine in the in-app preview but looked too airy between examples in an actual Anki
 * review, so only this rendering was tightened.
 *
 * When you change the preview templates (or the helpers they call), change this to match and bump
 * `--pd-style-version` in card.css so the next "Add to Anki" re-pushes the styling.
 */

// Mirror of CardNew.STACKED_FIELD_KINDS - prose-like kinds that each get their own line rather
// than wrapping inline with the badges/tags.
const STACKED_KINDS: ReadonlySet<PlacedFieldData['kind']> = new Set<PlacedFieldData['kind']>([
  'inflectionForm',
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
  return entry.pronunciations.find((p) => p.label === null) ?? entry.pronunciations[0] ?? null;
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

// Mirror of CardNew.cefrLevelClasses.
function cefrLevelClasses(level: string): string {
  switch (level.charAt(0).toLowerCase()) {
    case 'a':
      return 'bg-emerald-600/90 dark:bg-emerald-500/80';
    case 'b':
      return 'bg-sky-600/90 dark:bg-sky-500/80';
    default:
      return 'bg-violet-600/90 dark:bg-violet-500/80';
  }
}

function senseOf(field: EntryFieldData) {
  return field.senseIndex !== undefined ? (field.entry.senses[field.senseIndex] ?? null) : null;
}

function exampleOf(field: EntryFieldData) {
  return field.exampleIndex !== undefined
    ? (senseOf(field)?.examples[field.exampleIndex] ?? null)
    : null;
}

function inflectionOf(field: EntryFieldData) {
  return field.formIndex !== undefined
    ? (field.entry.inflectionForms[field.formIndex] ?? null)
    : null;
}

// The preview renders these as inline primeicons `<svg>`; here they're a `pd-i pd-i-<name>` span
// that card.css fills from a CSS-mask (see card.css) - so a card with a dozen audio buttons carries
// ~40 chars each instead of the ~600-char SVG path repeated. `classes` still carries the size and
// `text-*` colour utilities, which the mask picks up via `background-color: currentColor`.
function icon(name: 'volume-up' | 'key', classes: string, title?: string): string {
  const titleAttr = title ? ` title="${esc(title)}"` : '';
  return `<span class="pd-i pd-i-${name} ${classes}" aria-hidden="true"${titleAttr}></span>`;
}

// Mirror of CardNew.playAudio: play a remote clip, swallow the click. Works in Anki's webview too.
function playAudio(url: string): string {
  return `event.stopPropagation();new Audio('${attrUrl(url)}').play();return false;`;
}

function pronunciationAudioButton(url: string, side: 'uk' | 'us'): string {
  const label = side === 'uk' ? 'UK' : 'US';
  const title = side === 'uk' ? 'Play British pronunciation' : 'Play American pronunciation';
  const iconColor =
    side === 'uk' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  return (
    `<button type="button" class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--p-text-muted-color)] hover:bg-black/5 dark:hover:bg-white/10" ` +
    `title="${title}" onclick="${playAudio(url)}">${icon('volume-up', `size-3 ${iconColor}`)}${label}</button>`
  );
}

// Compact pronunciation used inside an inflection form: `{ipa} [UK] [US]`, no title on the buttons.
function inflectionPronunciation(variant: PhoneticVariant, side: 'uk' | 'us'): string {
  const label = side === 'uk' ? 'UK' : 'US';
  const iconColor =
    side === 'uk' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400';
  const audio = variant.audioUrl
    ? `<button type="button" class="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--p-text-muted-color)] hover:bg-black/5 dark:hover:bg-white/10" onclick="${playAudio(variant.audioUrl)}">${icon('volume-up', `size-3 ${iconColor}`)}${label}</button>`
    : '';
  return `<span class="inline-flex items-center gap-1 text-xs text-[var(--p-text-muted-color)]">${esc(formatIpa(variant.ipa))}${audio}</span>`;
}

function keywordBadges(
  isKeyword: boolean | undefined,
  level: string | null | undefined,
  keyTitle: string,
): string {
  const key = isKeyword ? icon('key', 'size-3 text-amber-500 dark:text-amber-400', keyTitle) : '';
  const badge = level
    ? `<span class="rounded px-1 text-[10px] font-bold uppercase text-white ${cefrLevelClasses(level)}" title="CEFR level">${esc(level)}</span>`
    : '';
  return key + badge;
}

// Mirror of the #fieldChip template's @switch - the value of a single field, no "Label:" prefix.
function renderChip(field: PlacedFieldData): string {
  switch (field.kind) {
    case 'headword':
      return `<span class="text-[var(--p-text-color)]">${esc(field.entry.headword)}</span>`;
    case 'partOfSpeech':
      return `<span class="italic text-[var(--p-text-color)]">${esc(field.entry.partOfSpeech ?? '')}</span>`;
    case 'homographNumber':
      return `<span class="text-[var(--p-text-color)]">${esc(field.entry.homographNumber ?? '')}</span>`;
    case 'grammar':
      return `<span class="rounded border border-slate-400/40 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-400/40 dark:text-slate-300">${esc(field.entry.grammar ?? '')}</span>`;
    case 'pronunciation-british': {
      const uk = britishPhonetic(field.entry);
      if (!uk) return '';
      const audio = uk.audioUrl ? pronunciationAudioButton(uk.audioUrl, 'uk') : '';
      return `<span class="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted-color)]">${esc(formatIpa(uk.ipa))}${audio}</span>`;
    }
    case 'pronunciation-american': {
      const us = americanPhonetic(field.entry);
      if (!us) return '';
      const audio = us.audioUrl ? pronunciationAudioButton(us.audioUrl, 'us') : '';
      return `<span class="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted-color)]">${esc(formatIpa(us.ipa))}${audio}</span>`;
    }
    case 'keyword':
      return `<span class="inline-flex items-center gap-1.5">${keywordBadges(field.entry.isKeyword, field.entry.keywordLevel, 'Oxford 3000/5000 keyword')}</span>`;
    case 'frequencyLabels': {
      const labels = field.entry.frequencyLabels ?? [];
      const inner = labels
        .map((label) => {
          const title = label.description ? ` title="${esc(label.description)}"` : '';
          return isFrequencyDots(label.code)
            ? `<span class="text-xs tracking-tighter text-[#b3453f] dark:text-[#e08a86]"${title}>${esc(label.code)}</span>`
            : `<span class="rounded border border-[#b3453f]/40 px-1 text-[10px] font-bold uppercase text-[#b3453f] dark:border-[#e08a86]/40 dark:text-[#e08a86]"${title}>${esc(label.code)}</span>`;
        })
        .join('');
      return `<span class="inline-flex items-center gap-1.5">${inner}</span>`;
    }
    case 'inflectionForm': {
      const form = inflectionOf(field);
      if (!form) return '';
      const label = field.label
        ? `<span class="text-xs font-medium text-[var(--p-text-muted-color)]">${esc(field.label)}:</span>`
        : '';
      const uk = form.pronunciation?.british?.[0];
      const us = form.pronunciation?.american?.[0];
      return (
        `<span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">${label}` +
        `<span class="text-[var(--p-text-color)]">${esc(form.form)}</span>` +
        `${uk ? inflectionPronunciation(uk, 'uk') : ''}${us ? inflectionPronunciation(us, 'us') : ''}</span>`
      );
    }
    case 'senseImage': {
      const sense = senseOf(field);
      if (!sense?.imageUrl) return '';
      const alt = sense.definition ?? field.entry.headword;
      return `<img src="${attrUrl(sense.imageUrl)}" alt="${esc(alt)}" class="h-16 w-auto rounded border border-[var(--p-content-border-color)] object-contain" />`;
    }
    case 'senseDefinition': {
      const sense = senseOf(field);
      return sense
        ? `<span class="text-[var(--p-text-color)]">${esc(sense.definition ?? '')}</span>`
        : '';
    }
    case 'senseKeyword': {
      const sense = senseOf(field);
      if (!sense) return '';
      return `<span class="relative top-1 inline-flex items-center gap-1">${keywordBadges(sense.isKeyword, sense.cefrLevel, 'Oxford 3000/5000 keyword sense')}</span>`;
    }
    case 'senseGrammar': {
      const grammar = senseOf(field)?.grammar;
      return grammar
        ? `<span class="rounded border border-slate-400/40 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-400/40 dark:text-slate-300">${esc(grammar)}</span>`
        : '';
    }
    case 'senseRegister': {
      const register = senseOf(field)?.register;
      return register
        ? `<span class="rounded border border-amber-500/40 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-400/40 dark:text-amber-300">${esc(register)}</span>`
        : '';
    }
    case 'senseSynonyms': {
      const sense = senseOf(field);
      if (!sense?.synonyms.length) return '';
      return `<span class="text-xs"><span class="mr-1 rounded border border-blue-500/40 px-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:border-blue-400/40 dark:text-blue-300">Syn</span><span class="text-[var(--p-text-color)]">${esc(sense.synonyms.join(', '))}</span></span>`;
    }
    case 'senseAntonyms': {
      const sense = senseOf(field);
      if (!sense?.antonyms.length) return '';
      return `<span class="text-xs"><span class="mr-1 rounded border border-rose-500/40 px-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:border-rose-400/40 dark:text-rose-300">Opp</span><span class="text-[var(--p-text-color)]">${esc(sense.antonyms.join(', '))}</span></span>`;
    }
    case 'example': {
      const example = exampleOf(field);
      if (!example) return '';
      const lead = example.audioUrl
        ? `<button type="button" class="-mb-px inline-flex shrink-0 items-center rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10" title="Play example" onclick="${playAudio(example.audioUrl)}">${icon('volume-up', 'size-3.5 text-[var(--p-text-muted-color)]')}</button>`
        : `<span class="-mb-px inline-flex size-3.5 shrink-0 items-center justify-center text-[var(--p-text-muted-color)]" aria-hidden="true">•</span>`;
      const pattern = example.pattern
        ? `<span class="text-blue-300 mr-1 not-italic font-semibold">${esc(example.pattern)}:</span>`
        : '';
      const text = example.segments
        .map((segment) =>
          segment.isEmphasized
            ? `<span class="font-semibold">${esc(segment.text)}</span>`
            : `<span>${esc(segment.text)}</span>`,
        )
        .join('');
      const note = example.note
        ? `<span class="text-xs text-[var(--p-text-muted-color)]">${esc(example.note)}</span>`
        : '';
      return `<span class="inline-flex items-baseline gap-1.5 text-sm">${lead}<span class="italic text-[var(--p-text-color)]">${pattern}${text}</span>${note}</span>`;
    }
    case 'richText': {
      const textRight = field.direction === 'rtl' ? ' text-right' : '';
      // Intentionally raw, user-authored HTML - inserted as-is, same as the preview's [innerHTML].
      return `<div class="text-sm text-[var(--p-text-color)]${textRight}" dir="${field.direction}">${field.html()}</div>`;
    }
  }
}

// Mirror of #groupContent's inline row: headword/homograph/part of speech keep their own typography,
// everything else goes through renderChip; the wrapper stays inline for a sense definition so it
// flows as text, inline-block otherwise.
function renderInlineItem(field: PlacedFieldData): string {
  const wrapClass =
    field.kind === 'senseDefinition' ? 'mr-2 align-baseline' : 'mr-2 align-baseline inline-block';
  let inner: string;
  switch (field.kind) {
    case 'headword':
      inner = `<h2 class="inline font-serif text-2xl font-semibold text-[var(--p-text-color)]">${esc(field.entry.headword)}</h2>`;
      break;
    case 'homographNumber':
      inner = `<sup class="text-[0.7em] font-normal text-[var(--p-text-muted-color)]">${esc(field.entry.homographNumber ?? '')}</sup>`;
      break;
    case 'partOfSpeech':
      inner = `<span class="text-sm italic text-[var(--p-text-muted-color)]">${esc(field.entry.partOfSpeech ?? '')}</span>`;
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

  const cls = ['relative'];
  if (isInflection) cls.push('pl-4');
  if (number !== null) cls.push('pl-6');

  const numberHtml =
    number !== null
      ? `<span class="absolute left-0 top-1 text-sm font-semibold text-[var(--p-text-muted-color)]">${number}</span>`
      : '';
  const inlineHtml = `<div>${inline.map(renderInlineItem).join('')}</div>`;
  const stackedHtml = stacked.length
    ? `<div class="mt-1 flex flex-col gap-0.5">${stacked.map((field) => `<div>${renderChip(field)}</div>`).join('')}</div>`
    : '';

  return `<div class="${cls.join(' ')}">${numberHtml}${inlineHtml}${stackedHtml}</div>`;
}

/** One card side, ready to drop into an Anki `Front` / `Back` field. Empty groups -> empty string. */
export function renderCardSide(groups: readonly TreeNode[]): string {
  if (!groups.length) return '';
  const inner = groups.map(renderGroup).join('');
  return `<div class="pd-card"><div class="flex flex-col gap-3">${inner}</div></div>`;
}
