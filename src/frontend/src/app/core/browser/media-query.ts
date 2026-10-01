import { DOCUMENT, DestroyRef, inject, signal, type Signal } from '@angular/core';

/** Whether a CSS media query currently matches, kept live. Must run in an injection context. */
export function mediaQuery(query: string): Signal<boolean> {
  const list = inject(DOCUMENT).defaultView?.matchMedia(query);
  const matches = signal(list?.matches ?? false);

  if (list) {
    const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
    list.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => list.removeEventListener('change', onChange));
  }

  return matches.asReadonly();
}
