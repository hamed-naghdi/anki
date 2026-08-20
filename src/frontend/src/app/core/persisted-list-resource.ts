import { Signal, computed, effect, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

interface ListResponse {
  error: string | null;
}

export interface PersistedListResource {
  readonly items: Signal<string[]>;
  readonly isLoading: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly selected: Signal<string | null>;
  select(value: string): void;
  reload(): void;
}

/**
 * Shared behaviour behind DeckService/NoteTypeService: fetch a string list from the backend via
 * httpResource, and track a "current" selection persisted in localStorage - falling back to the
 * first item once loaded, and recovering gracefully if the persisted value no longer exists in
 * the list (e.g. a deck was renamed/deleted in Anki since).
 *
 * Must be called synchronously from an injection context (e.g. a service constructor/field
 * initializer), since both httpResource and effect() require one.
 */
export function createPersistedListResource<TResponse extends ListResponse>(
  endpoint: string,
  storageKey: string,
  extractItems: (response: TResponse) => string[],
): PersistedListResource {
  const resource = httpResource<TResponse>(() => endpoint);

  const items = computed(() => {
    const value = resource.value();
    return value ? extractItems(value) : [];
  });

  // A transport-level failure (network/parse) takes priority; otherwise surface the backend's own error message.
  const error = computed(() => resource.error()?.message ?? resource.value()?.error ?? null);

  const storedValue = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
  const explicitSelection = signal<string | null>(storedValue);

  const selected = computed(() => {
    const list = items();
    const explicit = explicitSelection();
    if (explicit && list.includes(explicit)) {
      return explicit;
    }
    // Keep showing the persisted choice while the list is still loading; once loaded, a
    // selection that no longer exists falls back to whatever the backend reports first.
    return list[0] ?? explicit ?? null;
  });

  effect(() => {
    const value = selected();
    if (value) {
      localStorage.setItem(storageKey, value);
    }
  });

  return {
    items,
    isLoading: resource.isLoading,
    error,
    selected,
    select: (value: string) => explicitSelection.set(value),
    reload: () => resource.reload(),
  };
}
