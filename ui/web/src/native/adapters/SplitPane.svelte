<!-- SplitPane in a parity scenario: the node's first and second slots as its snippets. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Split from "../../lib/components/SplitPane.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#snippet list(nodes: NodeData[])}
  {#each nodes as child, index (index)}<Render node={child} />{/each}
{/snippet}

{#if node.slots?.second}
  <Split {...given} size={given.size} label={given.label}>
    {#snippet first()}{@render list(node.slots?.first ?? [])}{/snippet}
    {#snippet second()}{@render list(node.slots?.second ?? [])}{/snippet}
  </Split>
{:else}
  <Split {...given} size={given.size} label={given.label}>
    {#snippet first()}{@render list(node.slots?.first ?? [])}{/snippet}
  </Split>
{/if}
