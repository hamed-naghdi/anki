import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Layout } from './layout/layout';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Layout],
  template: `
<!--    <h1>Hello, {{ title() }}</h1>-->
    <app-layout />
    <router-outlet />
  `,
  styles: [],
})
export class App {
  protected readonly title = signal('Anki');
}
