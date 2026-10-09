import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { FlagFill } from '@primeicons/angular/flag-fill';
import { Plus } from '@primeicons/angular/plus';
import { Search } from '@primeicons/angular/search';
import { Times } from '@primeicons/angular/times';
import { ButtonDirective } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { ankiFlag } from '../../core/anki/anki-flags';
import { AnkiNotes } from '../../core/anki/anki-notes';
import { valueOf } from '../../core/resource';

/** Every dictionary card in Anki, newest first, each opening in the editor. */
@Component({
  selector: 'app-cards',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FormField,
    ButtonDirective,
    IconField,
    InputIcon,
    InputText,
    FlagFill,
    Plus,
    Search,
    Times,
  ],
  templateUrl: './cards.html',
})
export class Cards {
  private readonly notes = inject(AnkiNotes);

  protected readonly ankiFlag = ankiFlag;

  protected readonly cards = resource({ loader: () => this.notes.list() });

  protected readonly filter = signal({ term: '' });
  protected readonly filterForm = form(this.filter);

  protected readonly filteredCards = computed(() => {
    const cards = valueOf(this.cards) ?? [];
    const term = this.filter().term.trim().toLowerCase();
    return term
      ? cards.filter(
          (card) =>
            card.word.toLowerCase().includes(term) || card.deck.toLowerCase().includes(term),
        )
      : cards;
  });

  protected clearFilter(): void {
    this.filter.set({ term: '' });
  }
}
