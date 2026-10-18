// The menu bar of the app in a browser tab (PageMenuBar.svelte): the native menu's spec (menuSpec.ts) as
// MenuBar menus, with the same state (menuState.ts), keys and actions, so both are one menu. Items only a
// desktop window has (Hide, Minimize, Quit...) are left out; separators that end up at an edge or doubled go.

import type { MenuBarMenu } from "@nibtree/ui/logic/menuBarModel";
import type { MenuItem } from "@nibtree/ui/logic/menuModel";
import type { MenuAction } from "./menuIds";
import { isShown, type MenuState } from "./menuState";
import { APP_NAME, type ActionEntry, type MenuEntry, type NativeItem, type TopMenu } from "./menuSpec";

export interface PageMenuContext {
  state: MenuState;
  /** Each item's key now, custom keys included (registry.menuAccelerators). */
  accelerators: Map<MenuAction, string | null>;
  recent: { text: string; open: () => void }[];
  /** A key in words for this platform (localKeys). */
  keyWords: (accelerator: string) => string;
  run: (action: MenuAction) => void;
  /** How the page does a system item, or null when a browser tab has no such thing. */
  native: (item: NativeItem) => (() => void) | null;
}

const NATIVE_TEXT: Record<NativeItem, string> = {
  Cut: "Cut",
  Copy: "Copy",
  Paste: "Paste",
  Services: "Services",
  Hide: "Hide",
  HideOthers: "Hide Others",
  ShowAll: "Show All",
  Quit: "Quit",
  Minimize: "Minimize",
  Maximize: "Maximize",
  Fullscreen: "Enter Full Screen",
  CloseWindow: "Close Window",
  BringAllToFront: "Bring All to Front",
};

export function pageMenus(spec: TopMenu[], context: PageMenuContext): MenuBarMenu[] {
  return spec
    .map((top) => ({ label: top.text, items: menuItems(top.items, context), strong: top.text === APP_NAME }))
    .filter((menu) => menu.items.length > 0);
}

function menuItems(entries: MenuEntry[], context: PageMenuContext): MenuItem[] {
  const items: MenuItem[] = [];
  for (const entry of entries) {
    const item = menuItem(entry, context);
    if (item) {
      items.push(item);
    }
  }
  return withoutStraySeparators(items);
}

function menuItem(entry: MenuEntry, context: PageMenuContext): MenuItem | null {
  switch (entry.kind) {
    case "action":
      return actionItem(entry, context);
    case "native": {
      const action = context.native(entry.item);
      return action ? { label: entry.text ?? NATIVE_TEXT[entry.item], action } : null;
    }
    case "separator":
      return isShown(entry.visibleWith ?? null, context.state) ? { separator: true } : null;
    case "submenu": {
      if (!isShown(entry.visibleWith ?? null, context.state)) {
        return null;
      }
      const submenu = menuItems(entry.items, context);
      return submenu.length > 0 ? { label: entry.text, submenu } : null;
    }
    case "recent": {
      const submenu: MenuItem[] = context.recent.map((recent) => ({ label: recent.text, action: recent.open }));
      const clear = actionItem(entry.clear, context);
      if (clear) {
        submenu.push(...(submenu.length > 0 ? [{ separator: true } as const] : []), clear);
      }
      return { label: entry.text, submenu, disabled: context.recent.length === 0 };
    }
  }
}

function actionItem(entry: ActionEntry, context: PageMenuContext): MenuItem | null {
  const state = context.state[entry.action];
  if (state?.visible === false) {
    return null;
  }
  const accelerator = context.accelerators.has(entry.action)
    ? (context.accelerators.get(entry.action) ?? null)
    : entry.accelerator;
  return {
    label: state?.text ?? entry.text,
    action: () => context.run(entry.action),
    disabled: state ? !state.enabled : false,
    checked: entry.check ? (state?.checked ?? false) : undefined,
    hint: accelerator ? context.keyWords(accelerator) : undefined,
  };
}

function withoutStraySeparators(items: MenuItem[]): MenuItem[] {
  const kept: MenuItem[] = [];
  for (const item of items) {
    const separator = "separator" in item;
    const afterSeparator = kept.length === 0 || "separator" in kept[kept.length - 1];
    if (!(separator && afterSeparator)) {
      kept.push(item);
    }
  }
  if (kept.length > 0 && "separator" in kept[kept.length - 1]) {
    kept.pop();
  }
  return kept;
}
