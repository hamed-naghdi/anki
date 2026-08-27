import { Routes } from '@angular/router';
import { Decks } from './decks/decks';
import { CardNew } from './card-new/card-new';
import { Cards } from './cards/cards';

export const routes: Routes = [
  { path: '', component: Decks },
  { path: 'cards', component: Cards },
  { path: 'cards/new', component: CardNew },
  { path: 'cards/:noteId/edit', component: CardNew },
];
