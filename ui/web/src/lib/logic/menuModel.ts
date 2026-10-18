// Menu items and keyboard movement, shared by Menu and MenuButton. The shapes match the app's context menu
// (src/lib/ui/menu.svelte.ts), so moving the app onto the library keeps its item lists.

export interface MenuCommand {
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Dim text on the right, such as a shortcut from commandKeys(id). */
  hint?: string;
  /** A check item: true shows a check mark, false leaves its place empty. */
  checked?: boolean;
}

export interface MenuSubmenu {
  label: string;
  submenu: MenuItem[];
  disabled?: boolean;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuItem = MenuCommand | MenuSubmenu | MenuSeparator;

export function isSeparator(item: MenuItem): item is MenuSeparator {
  return "separator" in item;
}

export function isSubmenu(item: MenuItem): item is MenuSubmenu {
  return "submenu" in item;
}

/** Whether a menu has check items, so every item leaves room for the mark and the labels line up. */
export function hasChecks(items: MenuItem[]): boolean {
  return items.some((item) => "checked" in item && item.checked !== undefined);
}

export function canHighlight(item: MenuItem): boolean {
  return !isSeparator(item) && !item.disabled;
}

/** The next item Up or Down can highlight from `index` (-1 for none), wrapping; -1 when none can be. */
export function stepHighlight(items: MenuItem[], index: number, step: 1 | -1): number {
  for (let tries = 1; tries <= items.length; tries++) {
    const next = (((index + step * tries) % items.length) + items.length) % items.length;
    if (canHighlight(items[next])) {
      return next;
    }
  }
  return -1;
}

/** The next item after `index` whose label starts with a typed letter, wrapping; -1 when none does. */
export function matchHighlight(items: MenuItem[], index: number, key: string): number {
  const wanted = key.toLowerCase();
  for (let tries = 1; tries <= items.length; tries++) {
    const next = (Math.max(index, -1) + tries) % items.length;
    const item = items[next];
    if (canHighlight(item) && !isSeparator(item) && item.label.trimStart().toLowerCase().startsWith(wanted)) {
      return next;
    }
  }
  return -1;
}

/** Where a menu of `width` x `height` opens at (x, y) so it stays inside the viewport (with a 4px margin). */
export function placeMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  alignEnd = false,
): { left: number; top: number } {
  const margin = 4;
  const wanted = alignEnd ? x - width : x;
  const left = Math.max(margin, Math.min(wanted, viewport.width - width - margin));
  const below = y + height <= viewport.height - margin;
  const top = below ? y : Math.max(margin, viewport.height - height - margin);
  return { left, top };
}
