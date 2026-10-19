<!-- A DragGhost in a parity scenario: it is `position: fixed`, so a transformed box over the frame holds it and its
     `x` and `y` count from the frame's corner, not the browser window's. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import DragGhost from "../../lib/components/DragGhost.svelte";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof DragGhost>);
</script>

<div class="window"><DragGhost {...given} /></div>

<style>
  .window {
    position: absolute;
    inset: 0;
    transform: translate(0);
  }
</style>
