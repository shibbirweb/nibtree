import { moveActivity } from "@nibtree/ui/logic/activityLayout";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_LAYOUT as DEFAULTS,
  firstPanelOn,
  followLayout,
  hidePanel,
  isSidePanel,
  panelShown,
  panelSide,
  type PanelSlots,
  showPanel,
  togglePanel,
} from "./sidePanels";

const START: PanelSlots = { left: "changes", right: "files", rightOpen: true };

describe("side panels", () => {
  it("open on the side of their icon", () => {
    expect(panelSide(DEFAULTS, "changes")).toBe("left");
    expect(panelSide(DEFAULTS, "notifications")).toBe("right");
    const moved = moveActivity(DEFAULTS, "changes", "right-bottom");
    expect(panelSide(moved, "changes")).toBe("right");
    expect(showPanel({ ...START, left: null }, moved, "changes")).toEqual({
      left: null,
      right: "changes",
      rightOpen: true,
    });
  });

  it("toggle: hide when shown, else show", () => {
    expect(togglePanel(START, DEFAULTS, "changes")).toEqual({ ...START, left: null });
    expect(togglePanel(START, DEFAULTS, "files")).toEqual({ ...START, rightOpen: false });
    expect(togglePanel(START, DEFAULTS, "ai")).toEqual({ ...START, right: "ai" });
    expect(togglePanel(START, DEFAULTS, "branches")).toEqual({ ...START, left: "branches" });
  });

  it("tell what is shown, and hide only what is shown", () => {
    expect(panelShown(START, "files")).toBe(true);
    expect(panelShown({ ...START, rightOpen: false }, "files")).toBe(false);
    expect(hidePanel(START, "ai")).toEqual(START);
  });

  it("go along when their icon moves to the other side", () => {
    const changesRight = moveActivity(DEFAULTS, "changes", "right-top");
    expect(followLayout(START, changesRight)).toEqual({ left: null, right: "changes", rightOpen: true });
    const filesLeft = moveActivity(DEFAULTS, "files", "left-bottom");
    expect(followLayout(START, filesLeft)).toEqual({ left: "files", right: "ai", rightOpen: false });
    // Moving one that is not shown changes nothing on screen.
    expect(followLayout(START, moveActivity(DEFAULTS, "ai", "left-top"))).toEqual(START);
  });

  it("swap back when the positions are reset", () => {
    const swapped = moveActivity(moveActivity(DEFAULTS, "changes", "right-top"), "files", "left-top");
    const shown: PanelSlots = { left: "files", right: "changes", rightOpen: true };
    expect(followLayout(shown, swapped)).toEqual(shown);
    expect(followLayout(shown, DEFAULTS)).toEqual({ left: "changes", right: "files", rightOpen: true });
  });

  it("keep a closed right side ready to open on a panel that lives there", () => {
    const filesLeft = moveActivity(DEFAULTS, "files", "left-top");
    expect(followLayout({ left: null, right: "files", rightOpen: false }, filesLeft).right).toBe("ai");
    expect(firstPanelOn(DEFAULTS, "left")).toBe("changes");
    expect(firstPanelOn(DEFAULTS, "right")).toBe("files");
  });

  it("know which ids are panels", () => {
    expect(isSidePanel("files")).toBe(true);
    expect(isSidePanel("log")).toBe(false);
    expect(isSidePanel(null)).toBe(false);
  });
});
