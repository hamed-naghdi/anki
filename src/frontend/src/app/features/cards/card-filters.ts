import { Injectable, signal } from '@angular/core';

/** The card list's search box + pickers. `flag: null` = any flag; `deck: null` = every deck. */
export interface CardFilter {
  term: string;
  flag: number | null;
  deck: string | null;
}

export const NO_FILTER: CardFilter = { term: '', flag: null, deck: null };

/** History state a list row puts on its editor link, so the editor knows it can go back to it. */
export const FROM_CARD_LIST = { fromCardList: true } as const;

/**
 * The card list's filters, kept app-wide so going *back* to the list (the editor's Back button or
 * the browser's) finds it filtered as it was. Arriving any other way - the "Cards" links, a reload -
 * starts unfiltered (see Cards).
 */
@Injectable({ providedIn: 'root' })
export class CardFilters {
  readonly filter = signal<CardFilter>(NO_FILTER);
}
