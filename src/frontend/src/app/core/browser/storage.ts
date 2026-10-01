// localStorage can be missing (non-browser environments) or throw (blocked site data), and a
// remembered preference is never worth failing over - so both directions just give up quietly.

export function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // ignored - see above
  }
}
