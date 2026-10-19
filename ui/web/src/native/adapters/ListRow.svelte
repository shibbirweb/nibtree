<!-- ListRow in a parity scenario: its `trailing` slot after its words. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import ListRow from "../../lib/components/ListRow.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof ListRow>);
</script>

{#if node.slots?.trailing}
  <ListRow {...given}>
    {#snippet trailing()}{#each node.slots?.trailing ?? [] as child, index (index)}<Render
          node={child}
        />{/each}{/snippet}
  </ListRow>
{:else}
  <ListRow {...given} />
{/if}
