import { describe, expect, it } from "vitest";
import {
  activityBarItems,
  type ActivityLayout,
  dropIndex,
  moveActivity,
  normalizeActivityLayout,
  sameActivityLayout,
  sideOf,
  slotOf,
} from "./activityLayout";

const DEFAULTS: ActivityLayout = {
  "left-top": ["changes", "branches", "log"],
  "left-bottom": ["scripts", "terminal"],
  "right-top": ["files", "ai"],
  "right-bottom": ["notifications"],
};

describe("moveActivity", () => {
  it("moves an icon to the end of another slot", () => {
    const moved = moveActivity(DEFAULTS, "changes", "right-top");
    expect(moved["left-top"]).toEqual(["branches", "log"]);
    expect(moved["right-top"]).toEqual(["files", "ai", "changes"]);
    expect(slotOf(moved, "changes")).toBe("right-top");
  });

  it("puts it at a position, also in an empty slot", () => {
    expect(moveActivity(DEFAULTS, "log", "right-top", 0)["right-top"]).toEqual(["log", "files", "ai"]);
    const emptied = moveActivity(DEFAULTS, "notifications", "left-bottom");
    expect(moveActivity(emptied, "files", "right-bottom", 3)["right-bottom"]).toEqual(["files"]);
  });

  it("reorders inside a slot, counting the gap the icon leaves", () => {
    expect(moveActivity(DEFAULTS, "changes", "left-top", 2)["left-top"]).toEqual(["branches", "changes", "log"]);
    expect(moveActivity(DEFAULTS, "changes", "left-top", 3)["left-top"]).toEqual(["branches", "log", "changes"]);
    expect(moveActivity(DEFAULTS, "log", "left-top", 0)["left-top"]).toEqual(["log", "changes", "branches"]);
  });

  it("leaves the layout alone for an unknown icon", () => {
    expect(moveActivity(DEFAULTS, "nope", "left-top")).toBe(DEFAULTS);
  });
});

describe("normalizeActivityLayout", () => {
  it("keeps a saved layout", () => {
    const saved = moveActivity(DEFAULTS, "files", "left-top", 0);
    expect(normalizeActivityLayout(saved, DEFAULTS)).toEqual(saved);
  });

  it("drops unknown and repeated ids and adds a new icon at its default place", () => {
    const saved = { "left-top": ["changes", "changes", "ghost", 4], "right-top": ["files"], "right-bottom": [] };
    expect(normalizeActivityLayout(saved, DEFAULTS)).toEqual({
      "left-top": ["changes", "branches", "log"],
      "left-bottom": ["scripts", "terminal"],
      "right-top": ["files", "ai"],
      "right-bottom": ["notifications"],
    });
  });

  it("gives the defaults for anything else", () => {
    expect(normalizeActivityLayout(null, DEFAULTS)).toEqual(DEFAULTS);
    expect(normalizeActivityLayout("left", DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe("the rest", () => {
  it("compares layouts and names a slot's side", () => {
    expect(sameActivityLayout(DEFAULTS, normalizeActivityLayout({}, DEFAULTS))).toBe(true);
    expect(sameActivityLayout(DEFAULTS, moveActivity(DEFAULTS, "ai", "right-top", 0))).toBe(false);
    expect(sideOf("right-bottom")).toBe("right");
    expect(sideOf("left-top")).toBe("left");
  });

  it("lists one bar's items, top group, null, bottom group", () => {
    const named = (id: string) => (id === "log" ? null : id.toUpperCase());
    expect(activityBarItems(DEFAULTS, "left", named)).toEqual(["CHANGES", "BRANCHES", null, "SCRIPTS", "TERMINAL"]);
    expect(activityBarItems(DEFAULTS, "right", named)).toEqual(["FILES", "AI", null, "NOTIFICATIONS"]);
  });

  it("finds the drop position from the items' middles", () => {
    expect(dropIndex(5, [20, 60, 100])).toBe(0);
    expect(dropIndex(70, [20, 60, 100])).toBe(2);
    expect(dropIndex(500, [20, 60, 100])).toBe(3);
    expect(dropIndex(10, [])).toBe(0);
  });
});
