import { Component } from '@angular/core';
import { mediaQuery } from './core/browser/media-query';
import { Shell } from './shell/shell';

@Component({
  selector: 'app-root',
  imports: [Shell],
  template: `<app-shell />`,
  host: {
    // Card HTML (card.css) themes itself off Anki's `nightMode` class rather than the media query,
    // so mirror the OS theme onto it - that's what makes the in-app card preview follow dark mode.
    '[class.nightMode]': 'prefersDark()',
  },
})
export class App {
  protected readonly prefersDark = mediaQuery('(prefers-color-scheme: dark)');
}
