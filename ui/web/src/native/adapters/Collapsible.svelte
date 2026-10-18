<!-- Collapsible in a parity scenario: the node's children as its rows, its `actions` slot as the header's actions. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Collapsible from "../../lib/components/Collapsible.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#snippet rows()}
  {#each node.children ?? [] as child, index (index)}<Render node={child} />{/each}
{/snippet}

{#if node.slots?.actions}
  <Collapsible {...given} title={given.title} children={rows}>
    {#snippet actions()}{#each node.slots?.actions ?? [] as child, index (index)}<Render
          node={child}
        />{/each}{/snippet}
  </Collapsible>
{:else}
  <Collapsible {...given} title={given.title} children={rows} />
{/if}
