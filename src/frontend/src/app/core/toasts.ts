import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/** A button shown inside a toast, e.g. "Show in Anki". */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

/** What the shell's toast template reads from a message's `data`. */
export interface ToastData {
  readonly actions?: readonly ToastAction[];
}

/**
 * Short-lived notifications for the outcome of an action (saved, failed, ...), shown by the one
 * <p-toast> in the shell - so they fade on their own instead of staying on the page, and survive
 * navigating to another page (e.g. a toast's own "Edit" action). Errors stay up longer so the
 * message can actually be read.
 */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private readonly messages = inject(MessageService);

  success(summary: string, detail?: string, actions?: readonly ToastAction[]): void {
    this.show('success', summary, detail, actions, 5000);
  }

  warn(summary: string, detail?: string): void {
    this.show('warn', summary, detail, undefined, 10000);
  }

  error(summary: string, detail?: string): void {
    this.show('error', summary, detail, undefined, 10000);
  }

  private show(
    severity: 'success' | 'warn' | 'error',
    summary: string,
    detail: string | undefined,
    actions: readonly ToastAction[] | undefined,
    life: number,
  ): void {
    const data: ToastData = { actions };
    this.messages.add({ severity, summary, detail, life, data });
  }
}
