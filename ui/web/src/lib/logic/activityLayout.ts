// Where each icon of the two activity bars sits: four slots (each bar's top and bottom group), each an ordered list
// of item ids. Moving an icon (from its menu, or by dragging it) and checking a saved layout against the defaults.

export type ActivitySide = "left" | "right";
export type ActivityGroup = "top" | "bottom";
export type ActivitySlot = `${ActivitySide}-${ActivityGroup}`;
export type ActivityLayout = Record<ActivitySlot, string[]>;

export const ACTIVITY_SLOTS: readonly ActivitySlot[] = ["left-top", "left-bottom", "right-top", "right-bottom"];

/** Where a drag would drop: a slot and the position in it. */
export interface ActivityTarget {
  slot: ActivitySlot;
  index: number;
}

export function slotOf(layout: ActivityLayout, id: string): ActivitySlot | null {
  return ACTIVITY_SLOTS.find((slot) => layout[slot].includes(id)) ?? null;
}

export function sideOf(slot: ActivitySlot): ActivitySide {
  return slot.startsWith("left") ? "left" : "right";
}

/** `id` taken out of its slot and put at `index` of `slot` (the end when `index` is past it). */
export function moveActivity(layout: ActivityLayout, id: string, slot: ActivitySlot, index?: number): ActivityLayout {
  const from = slotOf(layout, id);
  if (from === null) {
    return layout;
  }
  const at = layout[from].indexOf(id);
  const moved = { ...layout, [from]: layout[from].filter((item) => item !== id) };
  // Dropped further down its own slot: the gap it left shifts the rest up by one.
  const shift = from === slot && index !== undefined && index > at ? 1 : 0;
  const list = moved[slot];
  const to = Math.max(0, Math.min(list.length, (index ?? list.length) - shift));
  return { ...moved, [slot]: [...list.slice(0, to), id, ...list.slice(to)] };
}

/**
 * A saved layout made safe: only the default ids, each once, in the slot and order saved; an id the save does not
 * have (a new icon) goes to its default slot. Anything that is not a layout gives the defaults.
 */
export function normalizeActivityLayout(saved: unknown, defaults: ActivityLayout): ActivityLayout {
  const known = new Set(ACTIVITY_SLOTS.flatMap((slot) => defaults[slot]));
  const data = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const layout = {} as ActivityLayout;
  for (const slot of ACTIVITY_SLOTS) {
    const ids = Array.isArray(data[slot]) ? (data[slot] as unknown[]) : [];
    layout[slot] = [];
    for (const id of ids) {
      if (typeof id === "string" && known.has(id) && !seen.has(id)) {
        seen.add(id);
        layout[slot].push(id);
      }
    }
  }
  for (const slot of ACTIVITY_SLOTS) {
    layout[slot].push(...defaults[slot].filter((id) => !seen.has(id)));
  }
  return layout;
}

export function sameActivityLayout(a: ActivityLayout, b: ActivityLayout): boolean {
  return ACTIVITY_SLOTS.every((slot) => a[slot].join("\n") === b[slot].join("\n"));
}

/** One bar's `items` for ActivityBar: its top group, then `null`, then its bottom group; unknown ids are skipped. */
export function activityBarItems<T>(layout: ActivityLayout, side: ActivitySide, item: (id: string) => T | null) {
  const pick = (slot: ActivitySlot) => layout[slot].map(item).filter((entry): entry is T => entry !== null);
  return [...pick(`${side}-top`), null, ...pick(`${side}-bottom`)];
}

/** Where a pointer at `y` lands among items whose vertical middles are `middles`: how many lie above it. */
export function dropIndex(y: number, middles: readonly number[]): number {
  return middles.filter((middle) => middle < y).length;
}
