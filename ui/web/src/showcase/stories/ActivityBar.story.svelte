<script lang="ts">
  import ActivityBar from "$ui/components/ActivityBar.svelte";
  import Stack from "$ui/components/Stack.svelte";
  import Text from "$ui/components/Text.svelte";
  import type { IconName } from "$ui/icons";
  import { activityBarItems, type ActivityLayout, moveActivity } from "$ui/logic/activityLayout";

  let active = $state<string | null>("changes");
  let terminalOpen = $state(true);

  // Movable: drag an icon to the other bar or the other group; the layout keeps the places.
  const ICONS: Record<string, { icon: IconName; label: string }> = {
    changes: { icon: "git-compare", label: "Changes" },
    branches: { icon: "branch", label: "Branches" },
    terminal: { icon: "terminal", label: "Terminal" },
    files: { icon: "list-tree", label: "Files" },
    ai: { icon: "bot", label: "AI" },
    notifications: { icon: "bell", label: "Notifications" },
  };
  let layout = $state<ActivityLayout>({
    "left-top": ["changes", "branches"],
    "left-bottom": ["terminal"],
    "right-top": ["files", "ai"],
    "right-bottom": ["notifications"],
  });
  const item = (id: string) => ({ id, ...ICONS[id] });
  const move = (id: string, target: { slot: keyof ActivityLayout; index: number }) => {
    layout = moveActivity(layout, id, target.slot, target.index);
  };
</script>

<Stack direction="row" align="stretch" gap="lg">
  <ActivityBar
    label="Side panels"
    bind:active
    onselect={(id) => id === "terminal" && (terminalOpen = !terminalOpen)}
    items={[
      { id: "files", icon: "file", label: "Files" },
      {
        id: "changes",
        icon: "git-compare",
        label: "Changes",
        badge: 4,
        badgeTone: "danger",
        title: "Changes and its shortcut",
      },
      "divider",
      { id: "log", icon: "history", label: "Log" },
      null,
      { id: "terminal", icon: "terminal", label: "Terminal", active: terminalOpen },
      { id: "ai", icon: "bot", label: "AI", dot: true },
      { id: "settings", icon: "settings", label: "Settings" },
    ]}
  />
  <Text tone="dim">Open panel: {active}; the terminal toggles on its own ({terminalOpen ? "on" : "off"}).</Text>
  <ActivityBar label="Movable left" movable items={activityBarItems(layout, "left", item)} onmove={move} />
  <Text tone="dim">Drag the icons between the two movable bars and their top and bottom groups.</Text>
  <ActivityBar
    label="Movable right"
    side="right"
    movable
    items={activityBarItems(layout, "right", item)}
    onmove={move}
  />
</Stack>
