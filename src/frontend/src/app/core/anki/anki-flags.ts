/** How a card flag looks in the app: its Anki name, plus Tailwind classes for the icon and row. */
export interface AnkiFlag {
  readonly name: string;
  readonly icon: string;
  readonly row: string;
}

/**
 * Anki's seven card flags, by the number `cardsInfo` reports (0 = no flag). Rows get a light tint
 * of the flag's color, like Anki's own browser.
 */
const FLAGS: Readonly<Record<number, AnkiFlag>> = {
  1: { name: 'Red', icon: 'text-red-500', row: 'bg-red-500/10 hover:bg-red-500/20' },
  2: { name: 'Orange', icon: 'text-orange-400', row: 'bg-orange-400/10 hover:bg-orange-400/20' },
  3: { name: 'Green', icon: 'text-green-500', row: 'bg-green-500/10 hover:bg-green-500/20' },
  4: { name: 'Blue', icon: 'text-blue-500', row: 'bg-blue-500/10 hover:bg-blue-500/20' },
  5: { name: 'Pink', icon: 'text-pink-400', row: 'bg-pink-400/10 hover:bg-pink-400/20' },
  6: { name: 'Turquoise', icon: 'text-teal-400', row: 'bg-teal-400/10 hover:bg-teal-400/20' },
  7: { name: 'Purple', icon: 'text-purple-500', row: 'bg-purple-500/10 hover:bg-purple-500/20' },
};

export function ankiFlag(flag: number): AnkiFlag | null {
  return FLAGS[flag] ?? null;
}

/** Every flag a card can be given, "No flag" (0) first - for a picker. */
export const FLAG_OPTIONS: readonly { readonly value: number; readonly flag: AnkiFlag | null }[] = [
  { value: 0, flag: null },
  ...Object.entries(FLAGS).map(([value, flag]) => ({ value: Number(value), flag })),
];

/**
 * The user flag (0-7) out of a card's raw `flags` - Anki keeps it in the low 3 bits, and setting
 * one must leave the rest alone.
 */
export const USER_FLAG_MASK = 0b111;

export function userFlag(rawFlags: number): number {
  return rawFlags & USER_FLAG_MASK;
}
