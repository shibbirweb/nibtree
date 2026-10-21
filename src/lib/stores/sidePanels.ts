// The side panels and the two places that show them. Each panel opens on the side its activity bar icon sits
// (the icons move between the bars, see ui/web/src/lib/logic/activityLayout.ts); the left side shows one panel or
// none, the right side one panel while it is open. Moving a shown panel's icon to the other side moves the panel.

import {
  type ActivityLayout,
  type ActivitySide,
  ACTIVITY_SLOTS,
  sideOf,
  slotOf,
} from "@nibtree/ui/logic/activityLayout";

export type SidePanel = "changes" | "branches" | "scripts" | "files" | "ai" | "notifications";

export const SIDE_PANELS: readonly SidePanel[] = ["changes", "branches", "scripts", "files", "ai", "notifications"];

/** Every icon of the two bars and where it starts; Log and Terminal open no side panel. */
export const DEFAULT_ACTIVITY_LAYOUT: ActivityLayout = {
  "left-top": ["changes", "branches", "log"],
  "left-bottom": ["scripts", "terminal"],
  "right-top": ["files", "ai"],
  "right-bottom": ["notifications"],
};

/** What each side shows: `right` is kept while the right side is closed, so it opens on the same panel. */
export interface PanelSlots {
  left: SidePanel | null;
  right: SidePanel;
  rightOpen: boolean;
}

export function isSidePanel(value: unknown): value is SidePanel {
  return SIDE_PANELS.includes(value as SidePanel);
}

export function panelSide(layout: ActivityLayout, panel: SidePanel): ActivitySide {
  const slot = slotOf(layout, panel) ?? slotOf(DEFAULT_ACTIVITY_LAYOUT, panel);
  return slot ? sideOf(slot) : "left";
}

export function panelShown(slots: PanelSlots, panel: SidePanel): boolean {
  return slots.left === panel || (slots.rightOpen && slots.right === panel);
}

export function showPanel(slots: PanelSlots, layout: ActivityLayout, panel: SidePanel): PanelSlots {
  return panelSide(layout, panel) === "left" ? { ...slots, left: panel } : { ...slots, right: panel, rightOpen: true };
}

export function hidePanel(slots: PanelSlots, panel: SidePanel): PanelSlots {
  return {
    ...slots,
    left: slots.left === panel ? null : slots.left,
    rightOpen: slots.rightOpen && slots.right !== panel,
  };
}

/** An activity bar click: hide the panel when it is shown, else show it on its side. */
export function togglePanel(slots: PanelSlots, layout: ActivityLayout, panel: SidePanel): PanelSlots {
  return panelShown(slots, panel) ? hidePanel(slots, panel) : showPanel(slots, layout, panel);
}

/** The first side panel whose icon is on `side`, top group first. */
export function firstPanelOn(layout: ActivityLayout, side: ActivitySide): SidePanel | null {
  const ids = ACTIVITY_SLOTS.filter((slot) => sideOf(slot) === side).flatMap((slot) => layout[slot]);
  return ids.find(isSidePanel) ?? null;
}

/**
 * The slots after the icons moved to `layout`: a shown panel whose icon went to the other side goes along (it
 * replaces what that side showed), and a side never shows a panel whose icon is on the other side.
 */
export function followLayout(slots: PanelSlots, layout: ActivityLayout): PanelSlots {
  let next = slots;
  for (const panel of [slots.left, slots.rightOpen ? slots.right : null]) {
    if (panel !== null) {
      const shownLeft = slots.left === panel;
      if ((panelSide(layout, panel) === "left") !== shownLeft) {
        next = showPanel(hidePanel(next, panel), layout, panel);
      }
    }
  }
  // A closed right side keeps a panel to open with: one whose icon is on the right, if any is.
  if (!next.rightOpen && panelSide(layout, next.right) !== "right") {
    next = { ...next, right: firstPanelOn(layout, "right") ?? next.right };
  }
  return next;
}
