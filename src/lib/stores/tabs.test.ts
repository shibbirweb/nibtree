import { describe, expect, it } from "vitest";
import {
  adjacentTab,
  closeTabs,
  fileTabsUnder,
  moveTab,
  openTab,
  otherPaths,
  pathsToRight,
  pinnedFirst,
  pinTab,
  replaceTabPath,
  retargetTabs,
  setTabDirty,
  setTabPinned,
  showsTabAsTitle,
  tabLabels,
  unpinnedPaths,
  type FileTab,
  type TabsState,
} from "./tabs";
import { commitTabPath } from "./commitTabs";
import { NO_TAB_LIMIT, SINGLE_TAB } from "./tabLimit";

const empty: TabsState = { tabs: [], active: null };

function paths(state: TabsState): string[] {
  return state.tabs.map((tab) => `${tab.path}${tab.preview ? "*" : ""}${tab.dirty ? "!" : ""}`);
}

describe("openTab", () => {
  it("replaces the preview tab on single-click opens", () => {
    let state = openTab(empty, "a.ts", false);
    state = openTab(state, "b.ts", false);
    expect(paths(state)).toEqual(["b.ts*"]);
    expect(state.active).toBe("b.ts");
  });

  it("keeps pinned tabs and opens new ones after the active tab", () => {
    let state = openTab(empty, "a.ts", true);
    state = openTab(state, "b.ts", true);
    state = { ...state, active: "a.ts" };
    state = openTab(state, "c.ts", false);
    expect(paths(state)).toEqual(["a.ts", "c.ts*", "b.ts"]);
  });

  it("activates an existing tab and pins it on double-click", () => {
    let state = openTab(empty, "a.ts", false);
    state = openTab(state, "a.ts", true);
    expect(paths(state)).toEqual(["a.ts"]);
  });

  it("never replaces a preview tab with unsaved changes", () => {
    let state = openTab(empty, "a.ts", false);
    state = { ...state, tabs: [{ path: "a.ts", preview: true, dirty: true }] };
    state = openTab(state, "b.ts", false);
    expect(paths(state)).toEqual(["a.ts*!", "b.ts*"]);
  });
});

describe("pinning and dirty state", () => {
  it("editing pins the preview tab", () => {
    let state = openTab(empty, "a.ts", false);
    state = setTabDirty(state, "a.ts", true);
    expect(paths(state)).toEqual(["a.ts!"]);
    state = setTabDirty(state, "a.ts", false);
    expect(paths(state)).toEqual(["a.ts"]);
    state = openTab(state, "b.ts", false);
    expect(paths(state)).toEqual(["a.ts", "b.ts*"]);
  });

  it("pins explicitly", () => {
    expect(paths(pinTab(openTab(empty, "a.ts", false), "a.ts"))).toEqual(["a.ts"]);
  });

  it("returns the same state when nothing changes", () => {
    const state = openTab(empty, "a.ts", true);
    expect(setTabDirty(state, "a.ts", false)).toBe(state);
  });
});

describe("closing", () => {
  const three: TabsState = {
    tabs: [
      { path: "a", preview: false, dirty: false },
      { path: "b", preview: false, dirty: false },
      { path: "c", preview: false, dirty: false },
    ],
    active: "b",
  };

  it("activates the right neighbour, then the left", () => {
    expect(closeTabs(three, ["b"]).active).toBe("c");
    expect(closeTabs({ ...three, active: "c" }, ["c"]).active).toBe("b");
    expect(closeTabs(three, ["a", "b", "c"]).active).toBeNull();
  });

  it("keeps the active tab when closing others", () => {
    const closed = closeTabs(three, otherPaths(three, "b"));
    expect(paths(closed)).toEqual(["b"]);
    expect(closed.active).toBe("b");
    expect(pathsToRight(three, "a")).toEqual(["b", "c"]);
  });
});

describe("tabLabels", () => {
  it("adds the folder only for duplicate names", () => {
    const labels = tabLabels([
      { path: "apps/web/index.ts", preview: false, dirty: false },
      { path: "apps/api/index.ts", preview: false, dirty: false },
      { path: "README.md", preview: false, dirty: false },
    ]);
    expect(labels.get("apps/web/index.ts")).toEqual({ name: "index.ts", hint: "web" });
    expect(labels.get("apps/api/index.ts")).toEqual({ name: "index.ts", hint: "api" });
    expect(labels.get("README.md")).toEqual({ name: "README.md", hint: null });
  });

  it("adds as much of the folder as tells two worktrees' files apart", () => {
    const labels = tabLabels([
      { path: "/w/shop/src/prices.ts", preview: false, dirty: false },
      { path: "/w/shop-fix-tax/src/prices.ts", preview: false, dirty: false },
      { path: "/w/shop/lib/prices.ts", preview: false, dirty: false },
    ]);
    expect(labels.get("/w/shop/src/prices.ts")?.hint).toBe("shop/src");
    expect(labels.get("/w/shop-fix-tax/src/prices.ts")?.hint).toBe("shop-fix-tax/src");
    expect(labels.get("/w/shop/lib/prices.ts")?.hint).toBe("lib");
  });
});

describe("adjacentTab", () => {
  const tabs = ["/w/a.ts", "/w/b.ts", "/w/c.ts"].map((path) => ({ path, preview: false, dirty: false }));

  it("steps to the next and previous tab, wrapping around", () => {
    expect(adjacentTab(tabs, "/w/a.ts", 1)).toBe("/w/b.ts");
    expect(adjacentTab(tabs, "/w/c.ts", 1)).toBe("/w/a.ts");
    expect(adjacentTab(tabs, "/w/a.ts", -1)).toBe("/w/c.ts");
  });

  it("starts at an end when no tab is on screen", () => {
    expect(adjacentTab(tabs, null, 1)).toBe("/w/a.ts");
    expect(adjacentTab(tabs, null, -1)).toBe("/w/c.ts");
    expect(adjacentTab(tabs, "/w/gone.ts", 1)).toBe("/w/a.ts");
  });

  it("has nothing to switch to without tabs", () => {
    expect(adjacentTab([], null, 1)).toBeNull();
  });
});

describe("retargetTabs", () => {
  const state: TabsState = {
    tabs: [
      { path: "/w/src/cart.ts", preview: false, dirty: false },
      { path: "/w/lib/a.ts", preview: true, dirty: false },
      { path: "/w/README.md", preview: false, dirty: true },
    ],
    active: "/w/lib/a.ts",
  };

  it("points renamed files and files inside moved folders at their new paths", () => {
    const next = retargetTabs(state, [
      { from: "/w/src/cart.ts", to: "/w/src/basket.ts" },
      { from: "/w/lib", to: "/w/src/lib" },
    ]);
    expect(paths(next)).toEqual(["/w/src/basket.ts", "/w/src/lib/a.ts*", "/w/README.md!"]);
    expect(next.active).toBe("/w/src/lib/a.ts");
  });

  it("returns the same state when nothing open moved", () => {
    expect(retargetTabs(state, [{ from: "/w/docs", to: "/w/guide" }])).toBe(state);
  });

  it("folds a moved tab into one already open on the new path", () => {
    const next = retargetTabs(
      { tabs: [...state.tabs, { path: "/w/src/basket.ts", preview: false, dirty: false }], active: "/w/src/cart.ts" },
      [{ from: "/w/src/cart.ts", to: "/w/src/basket.ts" }],
    );
    expect(paths(next)).toEqual(["/w/src/basket.ts", "/w/lib/a.ts*", "/w/README.md!"]);
    expect(next.active).toBe("/w/src/basket.ts");
  });

  it("never touches commit tabs", () => {
    const commit = commitTabPath("/w", "abc123");
    const next = retargetTabs({ tabs: [{ path: commit, preview: false, dirty: false }], active: commit }, [
      { from: "/w", to: "/x" },
    ]);
    expect(next.tabs[0].path).toBe(commit);
  });
});

describe("fileTabsUnder", () => {
  it("lists file tabs of the entries and inside folders, never pseudo tabs", () => {
    const commit = commitTabPath("/w/src", "abc123");
    expect(fileTabsUnder(["/w/src/a.ts", "/w/srcx/b.ts", commit, "/w/c.ts"], ["/w/src", "/w/c.ts"])).toEqual([
      "/w/src/a.ts",
      "/w/c.ts",
    ]);
  });
});

describe("setTabPinned", () => {
  it("pins and unpins, and pinning keeps a preview tab open", () => {
    const state = openTab(empty, "a.ts", false);
    const pinned = setTabPinned(state, "a.ts", true);
    expect(pinned.tabs[0]).toEqual({ path: "a.ts", preview: false, dirty: false, pinned: true });
    expect(setTabPinned(pinned, "a.ts", false).tabs[0].pinned).toBe(false);
    expect(setTabPinned(pinned, "a.ts", true)).toBe(pinned);
    expect(setTabPinned(pinned, "missing.ts", true)).toBe(pinned);
  });

  it("keeps a pinned tab when the next single click reuses the preview slot", () => {
    let state = setTabPinned(openTab(empty, "a.ts", false), "a.ts", true);
    state = openTab(state, "b.ts", false);
    expect(paths(state)).toEqual(["a.ts", "b.ts*"]);
  });
});

/** Tabs named in order; a trailing "^" marks a pinned one. */
function strip(...names: string[]): TabsState {
  const tabs: FileTab[] = names.map((name) => ({
    path: name.replace("^", ""),
    preview: false,
    dirty: false,
    pinned: name.endsWith("^"),
  }));
  return { tabs, active: tabs[0]?.path ?? null };
}

function order(state: TabsState): string[] {
  return state.tabs.map((tab) => `${tab.path}${tab.pinned ? "^" : ""}`);
}

describe("showsTabAsTitle", () => {
  it("shows a lone tab as a title only while the setting is on", () => {
    expect(showsTabAsTitle(true, SINGLE_TAB, 1, false)).toBe(true);
    expect(showsTabAsTitle(false, SINGLE_TAB, 1, false)).toBe(false);
  });

  it("shows the title only in single tab mode", () => {
    expect(showsTabAsTitle(true, NO_TAB_LIMIT, 1, false)).toBe(false);
    expect(showsTabAsTitle(true, 5, 1, false)).toBe(false);
  });

  it("counts the Diff tab", () => {
    expect(showsTabAsTitle(true, SINGLE_TAB, 0, true)).toBe(true);
    expect(showsTabAsTitle(true, SINGLE_TAB, 1, true)).toBe(false);
  });

  it("keeps tabs for an empty strip and for two or more tabs", () => {
    expect(showsTabAsTitle(true, SINGLE_TAB, 0, false)).toBe(false);
    expect(showsTabAsTitle(true, SINGLE_TAB, 2, false)).toBe(false);
  });
});

describe("pinned tabs", () => {
  it("pinning moves a tab to the end of the pinned ones, unpinning to the start of the others", () => {
    const state = strip("a^", "b^", "c", "d");
    expect(order(setTabPinned(state, "d", true))).toEqual(["a^", "b^", "d^", "c"]);
    expect(order(setTabPinned(state, "a", false))).toEqual(["b^", "a", "c", "d"]);
  });

  it("opens new tabs after the pinned ones", () => {
    const state = openTab(strip("a^", "b^", "c"), "d", true);
    expect(order(state)).toEqual(["a^", "b^", "d", "c"]);
    expect(state.active).toBe("d");
  });

  it("puts pinned tabs first, keeping each side in order", () => {
    const mixed = strip("a", "b^", "c", "d^");
    expect(order({ ...mixed, tabs: pinnedFirst(mixed.tabs) })).toEqual(["b^", "d^", "a", "c"]);
    const ordered = strip("a^", "b");
    expect(pinnedFirst(ordered.tabs)).toBe(ordered.tabs);
  });

  it("bulk closes skip pinned tabs", () => {
    const state = strip("a^", "b", "c^", "d");
    expect(otherPaths(state, "b")).toEqual(["d"]);
    expect(pathsToRight(state, "a")).toEqual(["b", "d"]);
    expect(unpinnedPaths(state.tabs)).toEqual(["b", "d"]);
  });
});

describe("moveTab", () => {
  it("moves a tab to a gap, counted before the move", () => {
    const state = strip("a", "b", "c", "d");
    expect(order(moveTab(state, "a", 3))).toEqual(["b", "c", "a", "d"]);
    expect(order(moveTab(state, "a", 4))).toEqual(["b", "c", "d", "a"]);
    expect(order(moveTab(state, "d", 0))).toEqual(["d", "a", "b", "c"]);
    expect(order(moveTab(state, "c", 1))).toEqual(["a", "c", "b", "d"]);
  });

  it("returns the same state for a drop next to the tab itself or an unknown tab", () => {
    const state = strip("a", "b", "c");
    expect(moveTab(state, "b", 1)).toBe(state);
    expect(moveTab(state, "b", 2)).toBe(state);
    expect(moveTab(state, "x", 0)).toBe(state);
  });

  it("never pins a tab dragged before the pinned ones", () => {
    const state = strip("a^", "b^", "c", "d");
    expect(order(moveTab(state, "d", 0))).toEqual(["a^", "b^", "d", "c"]);
    expect(order(moveTab(state, "d", 1))).toEqual(["a^", "b^", "d", "c"]);
    expect(moveTab(state, "c", 0)).toBe(state);
  });

  it("never unpins a pinned tab dragged past the others", () => {
    const state = strip("a^", "b^", "c", "d");
    expect(order(moveTab(state, "a", 4))).toEqual(["b^", "a^", "c", "d"]);
    expect(order(moveTab(state, "b", 0))).toEqual(["b^", "a^", "c", "d"]);
    expect(moveTab(state, "b", 3)).toBe(state);
  });

  it("keeps a dragged tab's flags", () => {
    const state: TabsState = {
      tabs: [
        { path: "a", preview: false, dirty: false, pinned: true },
        { path: "b", preview: false, dirty: true },
        { path: "c", preview: true, dirty: false },
      ],
      active: "c",
    };
    expect(moveTab(state, "c", 0).tabs[1]).toEqual({ path: "c", preview: true, dirty: false });
    expect(moveTab(state, "b", 3).tabs[2]).toEqual({ path: "b", preview: false, dirty: true });
  });
});

describe("replaceTabPath", () => {
  const untitled = "untitled:abc1";

  it("turns the Untitled tab into the file's tab at the same place", () => {
    const state: TabsState = {
      tabs: [
        { path: "/w/a.ts", preview: false, dirty: false },
        { path: untitled, preview: false, dirty: true, pinned: true },
        { path: "/w/b.ts", preview: false, dirty: false },
      ],
      active: untitled,
    };
    expect(replaceTabPath(state, untitled, "/w/new.md")).toEqual({
      tabs: [
        { path: "/w/a.ts", preview: false, dirty: false },
        { path: "/w/new.md", preview: false, dirty: false, pinned: true },
        { path: "/w/b.ts", preview: false, dirty: false },
      ],
      active: "/w/new.md",
    });
  });

  it("keeps the file's own tab when it has one", () => {
    const state: TabsState = {
      tabs: [
        { path: "/w/a.ts", preview: false, dirty: false },
        { path: untitled, preview: false, dirty: true },
      ],
      active: untitled,
    };
    expect(replaceTabPath(state, untitled, "/w/a.ts")).toEqual({
      tabs: [{ path: "/w/a.ts", preview: false, dirty: false }],
      active: "/w/a.ts",
    });
  });

  it("leaves a group without the tab alone", () => {
    const state: TabsState = { tabs: [{ path: "/w/a.ts", preview: false, dirty: false }], active: "/w/a.ts" };
    expect(replaceTabPath(state, untitled, "/w/b.ts")).toBe(state);
  });

  it("labels Untitled tabs as pseudo tabs, never as files", () => {
    const labels = tabLabels([
      { path: untitled, preview: false, dirty: false },
      { path: "/w/Untitled", preview: false, dirty: false },
    ]);
    expect(labels.get(untitled)).toEqual({ name: "Untitled", hint: null });
    expect(labels.get("/w/Untitled")).toEqual({ name: "Untitled", hint: null });
    expect(fileTabsUnder([untitled, "/w/a.ts"], ["/w"])).toEqual(["/w/a.ts"]);
  });
});
