<!-- MergeStackFrame in a parity scenario: empty panes, and the node's resultEnd slot as its snippet. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Frame from "../../lib/components/MergeStackFrame.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#if node.slots?.resultEnd}
  <Frame {...given} label={given.label}>
    {#snippet resultEnd()}
      {#each node.slots?.resultEnd ?? [] as child, index (index)}<Render node={child} />{/each}
    {/snippet}
  </Frame>
{:else}
  <Frame {...given} label={given.label} />
{/if}
