<!-- `count` copies of a scenario for timing. -->
<script lang="ts">
  import type { ScenarioNode as Node } from "../../../swift/scripts/parity/scenario";
  import ScenarioNode from "./ScenarioNode.svelte";

  let { node, width, count }: { node: Node; width: number; count: number } = $props();
</script>

<div style:width="{width}px">
  {#each { length: count } as _, index (index)}
    <ScenarioNode {node} />
  {/each}
</div>
