import { Directive, booleanAttribute, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Shows HTML from render-card.ts - the exact markup Anki will store - styled by card.css.
 *
 * It's marked trusted on purpose. The sanitizer would strip the inline `onclick` handlers the
 * audio buttons rely on (they have to be inline: no app code runs inside Anki). That's safe here
 * because render-card.ts escapes every dictionary value it interpolates, and the only raw HTML is
 * what the user typed into their own rich-text blocks - which Anki renders unsanitized anyway.
 *
 * `inline` renders a lone field (not a whole card) flowing with the surrounding text.
 */
@Directive({
  selector: '[cardHtml]',
  host: {
    '[innerHTML]': 'trusted()',
    '[class.pd-card]': 'inline()',
    '[class.pd-card-inline]': 'inline()',
  },
})
export class CardHtml {
  readonly cardHtml = input.required<string>();
  readonly inline = input(false, { transform: booleanAttribute });

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly trusted = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.cardHtml()),
  );
}
