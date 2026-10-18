<!-- Badge in a parity scenario. A `corner` badge is pinned to a positioned parent's top right corner (a Button's
     options count); here that parent is a box of no size at the node's spot, which is how the Swift side places it. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Badge from "../../lib/components/Badge.svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#if given.size === "corner"}
  <span class="spot"><Badge {...given} count={given.count} /></span>
{:else}
  <Badge {...given} count={given.count} />
{/if}

<style>
  .spot {
    position: relative;
    flex: none;
    width: 0;
    height: 0;
  }
</style>
