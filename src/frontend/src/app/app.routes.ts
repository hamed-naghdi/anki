import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Decks',
    loadComponent: () => import('./features/decks/decks').then((m) => m.Decks),
  },
  {
    path: 'cards',
    title: 'Cards',
    loadComponent: () => import('./features/cards/cards').then((m) => m.Cards),
  },
  {
    path: 'cards/new',
    title: 'New card',
    loadComponent: () => import('./features/card-editor/card-editor').then((m) => m.CardEditor),
  },
  {
    path: 'cards/:noteId/edit',
    title: 'Edit card',
    loadComponent: () => import('./features/card-editor/card-editor').then((m) => m.CardEditor),
  },
  { path: '**', redirectTo: '' },
];
