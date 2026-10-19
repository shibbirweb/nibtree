<!-- A ZoomBadge in a parity scenario: it is `position: fixed`, so a transformed box over the frame holds it and it
     sits at the top of the frame, not of the browser window. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import ZoomBadge from "../../lib/components/ZoomBadge.svelte";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof ZoomBadge>);
</script>

<div class="window"><ZoomBadge {...given} /></div>

<style>
  .window {
    position: absolute;
    inset: 0;
    transform: translate(0);
  }
</style>
