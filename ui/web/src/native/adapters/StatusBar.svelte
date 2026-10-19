<!-- StatusBar in a parity scenario: its `start` and `end` slots as the two sides. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import StatusBar from "../../lib/components/StatusBar.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#snippet start()}{#each node.slots?.start ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
{#snippet end()}{#each node.slots?.end ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}

<StatusBar {...given} {start} {end} />
