<!-- The activity bar at the window's right edge, mirroring the left one: the icons whose place is on the right. -->
<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import ActivityBar from "@nibtree/ui/components/ActivityBar.svelte";
  import { activityBarItems } from "@nibtree/ui/logic/activityLayout";
  import { activityItem, activityMenu, selectActivity } from "./activityItems.svelte";

  const items = $derived(activityBarItems(settings.activityLayout, "right", activityItem));
</script>

<ActivityBar
  label="Right sidebar"
  side="right"
  {items}
  movable
  onselect={selectActivity}
  onmove={(id, target) => settings.moveActivity(id, target.slot, target.index)}
  oncontextmenu={(id, event) => contextMenu.open(event, activityMenu(id))}
/>
