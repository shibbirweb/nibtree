// The activity bars' icons, whichever bar and group they sit in (settings.activityLayout): each icon's look and
// tooltip, what a click does, and the right-click menu that moves it (Move to Left Top ... Reset Positions).

import { withCommandKeys } from "$lib/commands/commandRuntime";
import { bellTitle, hasUnreadError } from "$lib/notifications/notificationModel";
import { notifications } from "$lib/notifications/notifications.svelte";
import { repoStore } from "$lib/stores/repo.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { DEFAULT_ACTIVITY_LAYOUT, isSidePanel } from "$lib/stores/sidePanels";
import { terminalStore } from "$lib/terminal/terminalStore.svelte";
import type { MenuItem } from "$lib/ui/menu.svelte";
import type { IconName } from "@nibtree/ui/icons";
import { ACTIVITY_SLOTS, type ActivitySlot, sameActivityLayout, slotOf } from "@nibtree/ui/logic/activityLayout";
import { changesSelection } from "./changes/selection.svelte";

export interface ActivityIcon {
  id: string;
  icon: IconName;
  label: string;
  active: boolean;
  title: string;
  badge?: number;
  badgeTone?: "accent" | "danger" | "warning";
  dot?: boolean;
  smallIcon?: boolean;
}

const SLOT_NAMES: Record<ActivitySlot, string> = {
  "left-top": "Left Top",
  "left-bottom": "Left Bottom",
  "right-top": "Right Top",
  "right-bottom": "Right Bottom",
};

/** The tooltip: the name with its keys, and how to hide it while it is on. */
function tip(text: string, on: boolean): string {
  return `${text}${on ? ", click to hide" : ""}`;
}

function conflicts(): number {
  return Object.values(repoStore.statuses).reduce(
    (sum, status) => sum + status.files.filter((file) => file.conflicted).length,
    0,
  );
}

/** The icon for `id`, as ActivityBar draws it; null for an id that is not an icon. */
export function activityItem(id: string): ActivityIcon | null {
  const on = isSidePanel(id) && settings.panelShown(id);
  switch (id) {
    case "changes":
      return {
        id,
        icon: "git-compare",
        label: "Changes",
        active: on,
        title: tip(withCommandKeys("Changes", "view.changes"), on),
        badge: repoStore.totalChanges,
        badgeTone: conflicts() > 0 ? "danger" : "accent",
      };
    case "branches":
      return {
        id,
        icon: "branch",
        label: "Branches and Stashes",
        active: on,
        title: tip(withCommandKeys("Branches and Stashes", "view.branches"), on),
      };
    // The Log opens in the main area rather than in a side panel.
    case "log":
      return {
        id,
        icon: "history",
        label: "Log",
        active: changesSelection.logShown,
        title: tip(withCommandKeys("Log: commit history and graph", "view.log"), changesSelection.logShown),
      };
    // Scripts of package.json, composer.json, Makefiles and the like, run in a terminal.
    case "scripts":
      return {
        id,
        icon: "play",
        label: "Scripts",
        smallIcon: true,
        active: on,
        title: on ? "Scripts, click to hide" : "Scripts: run npm, Composer, Make and other project scripts",
      };
    // The terminal panel opens below the editor.
    case "terminal":
      return {
        id,
        icon: "terminal",
        label: "Terminal",
        active: terminalStore.panelOpen,
        title: tip(withCommandKeys("Terminal", "view.terminal"), terminalStore.panelOpen),
      };
    case "files":
      return {
        id,
        icon: "list-tree",
        label: "Files",
        active: on,
        title: tip(withCommandKeys("Files", "view.filesPanel"), on),
      };
    case "ai":
      return {
        id,
        icon: "bot",
        label: "AI Agents",
        active: on,
        // A hidden agent that finished or needs the user marks the icon while the panel is not shown.
        dot: !on && terminalStore.terminals.some((terminal) => terminal.agent && terminal.bell),
        title: tip(withCommandKeys("AI Agents", "view.aiPanel"), on),
      };
    case "notifications":
      return {
        id,
        icon: settings.notificationsDoNotDisturb ? "bell-off" : "bell",
        label: "Notifications",
        active: on,
        badge: notifications.unread,
        badgeTone: hasUnreadError(notifications.items) ? "danger" : "warning",
        title: withCommandKeys(
          bellTitle(notifications.unread, notifications.items.length, settings.notificationsDoNotDisturb),
          "view.notifications",
        ),
      };
    default:
      return null;
  }
}

/** An icon was clicked: a side panel shows or hides on its icon's side; the Log and the terminal toggle. */
export function selectActivity(id: string): void {
  if (id === "log") {
    changesSelection.toggleLog();
  } else if (id === "terminal") {
    terminalStore.toggle();
  } else if (isSidePanel(id)) {
    settings.togglePanel(id);
  }
}

/** The right-click menu: move the icon to another bar or group, or put every icon back. */
export function activityMenu(id: string): MenuItem[] {
  const here = slotOf(settings.activityLayout, id);
  return [
    ...ACTIVITY_SLOTS.map((slot) => ({
      label: `Move to ${SLOT_NAMES[slot]}`,
      disabled: slot === here,
      action: () => settings.moveActivity(id, slot),
    })),
    { separator: true as const },
    {
      label: "Reset Positions",
      disabled: sameActivityLayout(settings.activityLayout, DEFAULT_ACTIVITY_LAYOUT),
      action: () => settings.resetActivityLayout(),
    },
  ];
}
