// A menu bar's menus and keys, for MenuBar: which menu Left and Right reach, and what a key on a top button does.
import type { MenuItem } from "./menuModel";

export interface MenuBarMenu {
  label: string;
  items: MenuItem[];
  /** The app's own menu, its name in bold, as macOS shows it. */
  strong?: boolean;
}

/** The menu `step` places from `index`, wrapping at both ends. */
export function stepMenu(count: number, index: number, step: 1 | -1): number {
  if (count <= 0) {
    return -1;
  }
  return (((index + step) % count) + count) % count;
}

export type BarKey = { move: 1 | -1 } | { first: true } | { last: true } | { open: true } | null;

/** What a key does on a focused top button: move along the bar, or open its menu. */
export function barKey(key: string): BarKey {
  switch (key) {
    case "ArrowRight":
      return { move: 1 };
    case "ArrowLeft":
      return { move: -1 };
    case "Home":
      return { first: true };
    case "End":
      return { last: true };
    case "ArrowDown":
    case "Enter":
    case " ":
      return { open: true };
    default:
      return null;
  }
}
