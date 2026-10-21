<!-- The activity bar at the window's left edge: the icons whose place is on the left (settings.activityLayout). Any
     icon can be dragged to either bar, or moved from its right-click menu (activityItems.svelte.ts). -->
<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import ActivityBar from "@nibtree/ui/components/ActivityBar.svelte";
  import { activityBarItems } from "@nibtree/ui/logic/activityLayout";
  import { activityItem, activityMenu, selectActivity } from "./activityItems.svelte";

  const items = $derived(activityBarItems(settings.activityLayout, "left", activityItem));
</script>

<ActivityBar
  label="Sidebar"
  {items}
  movable
  onselect={selectActivity}
  onmove={(id, target) => settings.moveActivity(id, target.slot, target.index)}
  oncontextmenu={(id, event) => contextMenu.open(event, activityMenu(id))}
/>
