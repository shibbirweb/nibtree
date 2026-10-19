<!-- CornerCard in a parity scenario: its `action` slot as the action. The parity frame is positioned, so the card sits
     in its bottom right corner. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import CornerCard from "../../lib/components/CornerCard.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof CornerCard>);
</script>

{#if node.slots?.action}
  <CornerCard {...given}>
    {#snippet action()}{#each node.slots?.action ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
  </CornerCard>
{:else}
  <CornerCard {...given} />
{/if}
