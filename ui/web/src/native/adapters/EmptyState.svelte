<!-- EmptyState in a parity scenario: the node's `action` slot as its action. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import EmptyState from "../../lib/components/EmptyState.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#if node.slots?.action}
  <EmptyState {...given} title={given.title}>
    {#snippet action()}{#each node.slots?.action ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
  </EmptyState>
{:else}
  <EmptyState {...given} title={given.title} />
{/if}
