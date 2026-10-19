<!-- A LoadingOverlay in a parity scenario: it is `position: fixed`, so a transformed box over the frame holds it and it
     covers the frame, not the browser window. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import LoadingOverlay from "../../lib/components/LoadingOverlay.svelte";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof LoadingOverlay>);
</script>

<div class="window"><LoadingOverlay {...given} /></div>

<style>
  .window {
    position: absolute;
    inset: 0;
    transform: translate(0);
  }
</style>
