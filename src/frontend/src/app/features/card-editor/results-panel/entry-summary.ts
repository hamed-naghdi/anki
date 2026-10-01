import { Component, computed, input } from '@angular/core';
import { Key } from '@primeicons/angular/key';
import { VolumeUp } from '@primeicons/angular/volume-up';
import { isFrequencyDots, primaryPronunciation } from '../../../card/card-field';
import type { DictionaryEntry } from '../../../core/dictionary/dictionary.models';

/** An entry's row in the results tree: headword, audio, frequency/keyword badges, part of speech. */
@Component({
  selector: 'app-entry-summary',
  imports: [Key, VolumeUp],
  template: `
    @let entry = this.entry();
    <span class="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 py-0.5">
      <span class="font-serif text-[15px] font-semibold text-(--p-text-color)">
        {{ entry.headword }}
        @if (entry.homographNumber) {
          <sup class="ml-0.5 text-[0.65em] font-normal text-(--p-text-muted-color)">{{
            entry.homographNumber
          }}</sup>
        }
      </span>

      @if (audio().uk; as url) {
        <button
          type="button"
          [class]="audioButton"
          title="British pronunciation"
          (click)="play(url, $event)"
        >
          <svg data-p-icon="volume-up" class="size-3 text-red-600 dark:text-red-400"></svg>UK
        </button>
      }
      @if (audio().us; as url) {
        <button
          type="button"
          [class]="audioButton"
          title="American pronunciation"
          (click)="play(url, $event)"
        >
          <svg data-p-icon="volume-up" class="size-3 text-blue-600 dark:text-blue-400"></svg>US
        </button>
      }

      @if (entry.frequencyLabels?.length) {
        <span class="inline-flex items-center gap-1.5">
          @for (label of entry.frequencyLabels; track label.code) {
            @if (isFrequencyDots(label.code)) {
              <span
                class="text-xs tracking-tighter text-[#b3453f] dark:text-[#e08a86]"
                [title]="label.description ?? ''"
                >{{ label.code }}</span
              >
            } @else {
              <span
                class="rounded border border-[#b3453f]/40 px-1 text-[10px] font-bold uppercase text-[#b3453f] dark:border-[#e08a86]/40 dark:text-[#e08a86]"
                [title]="label.description ?? ''"
                >{{ label.code }}</span
              >
            }
          }
        </span>
      }

      @if (entry.isKeyword || entry.keywordLevel) {
        <span class="inline-flex items-center gap-1">
          @if (entry.isKeyword) {
            <svg data-p-icon="key" class="size-3 text-amber-500 dark:text-amber-400"></svg>
          }
          @if (entry.keywordLevel; as level) {
            <span
              class="rounded px-1 text-[10px] font-bold uppercase text-white {{
                cefrBackground(level)
              }}"
              title="CEFR level"
              >{{ level }}</span
            >
          }
        </span>
      }

      @if (entry.partOfSpeech) {
        <span class="text-xs font-normal italic text-(--p-text-muted-color)">{{
          entry.partOfSpeech
        }}</span>
      }
    </span>
  `,
})
export class EntrySummary {
  readonly entry = input.required<DictionaryEntry>();

  protected readonly isFrequencyDots = isFrequencyDots;
  protected readonly audioButton =
    'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-(--p-text-muted-color) hover:bg-black/5 dark:hover:bg-white/10';

  protected readonly audio = computed(() => {
    const pronunciation = primaryPronunciation(this.entry());
    return {
      uk: pronunciation?.british[0]?.audioUrl ?? null,
      us: pronunciation?.american[0]?.audioUrl ?? null,
    };
  });

  /** CEFR levels in three bands, beginner (green) to advanced (violet). */
  protected cefrBackground(level: string): string {
    switch (level.charAt(0).toLowerCase()) {
      case 'a':
        return 'bg-emerald-600/90 dark:bg-emerald-500/80';
      case 'b':
        return 'bg-sky-600/90 dark:bg-sky-500/80';
      default:
        return 'bg-violet-600/90 dark:bg-violet-500/80';
    }
  }

  // Stop the click from also toggling the tree row's checkbox.
  protected play(url: string, event: Event): void {
    event.stopPropagation();
    void new Audio(url).play();
  }
}
