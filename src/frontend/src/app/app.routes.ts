import { Routes } from '@angular/router';
import { Decks } from './decks/decks';
import { CardNew } from './card-new/card-new';

export const routes: Routes = [
  { path: '', component: Decks },
  { path: 'card-new', component: CardNew },
];
