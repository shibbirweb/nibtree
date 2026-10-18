<!-- `count` copies of a scenario for timing. -->
<script lang="ts">
  import type { ScenarioNode as Node } from "../../../swift/scripts/parity/scenario";
  import ScenarioNode from "./ScenarioNode.svelte";

  let { node, width, height, count }: { node: Node; width: number; height?: number; count: number } = $props();
</script>

<!-- A scenario with a height gets a box that high per copy, like the parity frame, for components that fill it. -->
<div style:width="{width}px">
  {#each { length: count } as _, index (index)}
    {#if height}
      <div class="copy" style:height="{height}px"><ScenarioNode {node} /></div>
    {:else}
      <ScenarioNode {node} />
    {/if}
  {/each}
</div>

<style>
  .copy {
    display: flex;
    flex-direction: column;
  }
</style>
