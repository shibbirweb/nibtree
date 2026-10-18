import { describe, expect, it } from "vitest";
import type { MenuItem } from "@nibtree/ui/logic/menuModel";
import type { MenuAction } from "./menuIds";
import { actionEntries, menuSpec, type NativeItem } from "./menuSpec";
import type { MenuState } from "./menuState";
import { pageMenus, type PageMenuContext } from "./pageMenu";

const PAGE_NATIVE: NativeItem[] = ["Cut", "Copy", "Paste", "Fullscreen", "CloseWindow"];

function context(overrides: Partial<PageMenuContext> = {}): PageMenuContext {
  return {
    state: {},
    accelerators: new Map(),
    recent: [],
    keyWords: (accelerator) => `<${accelerator}>`,
    run: () => undefined,
    native: (item) => (PAGE_NATIVE.includes(item) ? () => undefined : null),
    ...overrides,
  };
}

function walk(items: MenuItem[], visit: (item: MenuItem, list: MenuItem[], index: number) => void): void {
  items.forEach((item, index) => {
    visit(item, items, index);
    if ("submenu" in item) {
      walk(item.submenu, visit);
    }
  });
}

function find(items: MenuItem[], label: string): MenuItem | null {
  let found: MenuItem | null = null;
  walk(items, (item) => {
    if (!found && "label" in item && item.label === label) {
      found = item;
    }
  });
  return found;
}

const spec = menuSpec("macos", "app");
const checkEntry = actionEntries(spec).find((entry) => entry.check);

describe("pageMenus", () => {
  it("keeps the native menu's menus and leaves out what only a desktop window has", () => {
    const menus = pageMenus(spec, context());
    expect(menus.map((menu) => menu.label)).toEqual(spec.map((top) => top.text));
    // The app's own menu (macOS) is the one in bold.
    expect(menus.filter((menu) => menu.strong).map((menu) => menu.label)).toEqual(["Nibtree"]);
    const all = menus.flatMap((menu) => menu.items);
    for (const label of ["Services", "Hide Others", "Show All", "Minimize", "Bring All to Front"]) {
      expect(find(all, label)).toBeNull();
    }
    expect(find(all, "Cut")).not.toBeNull();
  });

  it("never starts, ends or doubles a separator", () => {
    for (const menu of pageMenus(spec, context())) {
      walk(menu.items, (item, list, index) => {
        if ("separator" in item) {
          expect(index).toBeGreaterThan(0);
          expect(index).toBeLessThan(list.length - 1);
          expect("separator" in list[index + 1]).toBe(false);
        }
      });
    }
  });

  it("follows the menu state: enabled, checked, text and visible", () => {
    expect(checkEntry).toBeDefined();
    const action = checkEntry!.action;
    const state: MenuState = { [action]: { enabled: false, checked: true, text: "Renamed" } };
    const item = find(
      pageMenus(spec, context({ state })).flatMap((menu) => menu.items),
      "Renamed",
    );
    expect(item).toMatchObject({ label: "Renamed", disabled: true, checked: true });
    const hidden: MenuState = { [action]: { enabled: true, visible: false } };
    const items = pageMenus(spec, context({ state: hidden })).flatMap((menu) => menu.items);
    expect(find(items, checkEntry!.text)).toBeNull();
  });

  it("shows each item's current key in words and runs its action", () => {
    const first = actionEntries(spec).find((entry) => entry.accelerator && !entry.check)!;
    const ran: MenuAction[] = [];
    const custom = new Map<MenuAction, string | null>([[first.action, "CmdOrCtrl+Alt+K"]]);
    const items = pageMenus(spec, context({ accelerators: custom, run: (action) => ran.push(action) })).flatMap(
      (menu) => menu.items,
    );
    const item = find(items, first.text);
    expect(item).toMatchObject({ hint: "<CmdOrCtrl+Alt+K>" });
    (item as { action: () => void }).action();
    expect(ran).toEqual([first.action]);
    const removed = new Map<MenuAction, string | null>([[first.action, null]]);
    const plain = find(
      pageMenus(spec, context({ accelerators: removed })).flatMap((menu) => menu.items),
      first.text,
    );
    expect(plain).toMatchObject({ hint: undefined });
  });

  it("lists recent folders above Clear Recent, and dims the menu without any", () => {
    const empty = find(
      pageMenus(spec, context()).flatMap((menu) => menu.items),
      "Open Recent",
    );
    expect(empty).toMatchObject({ disabled: true });
    const opened: string[] = [];
    const recent = [{ text: "~/code/nibtree", open: () => opened.push("nibtree") }];
    const filled = find(
      pageMenus(spec, context({ recent })).flatMap((menu) => menu.items),
      "Open Recent",
    ) as { submenu: MenuItem[]; disabled: boolean };
    expect(filled.disabled).toBe(false);
    expect(filled.submenu[0]).toMatchObject({ label: "~/code/nibtree" });
    expect("separator" in filled.submenu[1]).toBe(true);
    (filled.submenu[0] as { action: () => void }).action();
    expect(opened).toEqual(["nibtree"]);
  });
});
