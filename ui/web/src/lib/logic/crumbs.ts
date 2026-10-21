// The Navigation Bar's geometry: which crumbs give up their width first when the bar is narrow, and where a crumb's
// list opens (under the crumb, or above it when the room below is short), always inside the window, and what a key
// does in that list.
import { paletteMove, paletteStep } from "./palette";
import type { TriggerRect } from "./popoverPlace";

/** A crumb's flex-shrink: 10 to the power of its distance from the last one, so the farthest shorten first. */
export function crumbShrink(index: number, count: number): number {
  const distance = count - 1 - index;
  return distance <= 0 ? 1 : 10 ** Math.min(distance, 6);
}

export interface CrumbPlaceSizes {
  width: number;
  maxHeight: number;
  minHeight: number;
  offset: number;
  inset: number;
  /** Below this much room under the crumb, the list opens above it when there is more room there. */
  roomBelow: number;
}

export interface CrumbPlace {
  left: number;
  /** From the window's top, for a list under the crumb. */
  top: number | null;
  /** From the window's bottom, for a list above the crumb. */
  bottom: number | null;
  width: number;
  maxHeight: number;
}

export function crumbPlace(
  crumb: TriggerRect,
  viewport: { width: number; height: number },
  sizes: CrumbPlaceSizes,
): CrumbPlace {
  const width = Math.min(sizes.width, viewport.width - 2 * sizes.inset);
  const left = Math.max(sizes.inset, Math.min(crumb.left - sizes.offset - 1, viewport.width - width - sizes.inset));
  // The room on each side, leaving the gap to the crumb and the window's inset (and its shadow) free.
  const margin = 3 * sizes.offset + sizes.inset;
  const below = viewport.height - crumb.bottom - margin;
  const above = crumb.top - margin;
  if (below < sizes.roomBelow && above > below) {
    const bottom = viewport.height - crumb.top + sizes.offset;
    return { left, top: null, bottom, width, maxHeight: Math.min(sizes.maxHeight, above) };
  }
  const maxHeight = Math.max(sizes.minHeight, Math.min(sizes.maxHeight, below));
  return { left, top: crumb.bottom + sizes.offset, bottom: null, width, maxHeight };
}

/** A key in a crumb's list: the entry to select, "pick", "close", "keep" (Tab stays in the list) or null (not ours). */
export type CrumbKey = number | "pick" | "close" | "keep" | null;

export function crumbPopupKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  list: { selected: number; count: number; query: string },
): CrumbKey {
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  const by = paletteStep(event);
  if (by !== 0) {
    return paletteMove(list.selected, list.count, by);
  }
  if (plain && list.query === "" && (event.key === "Home" || event.key === "End")) {
    return event.key === "Home" ? 0 : Math.max(0, list.count - 1);
  }
  if (event.key === "Enter" && list.selected >= 0 && list.selected < list.count) {
    return "pick";
  }
  if (event.key === "Escape") {
    return "close";
  }
  return event.key === "Tab" ? "keep" : null;
}
