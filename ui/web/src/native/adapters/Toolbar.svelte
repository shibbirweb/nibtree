<!-- Toolbar in a parity scenario: its children at the start and its `end` slot at the far end. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Toolbar from "../../lib/components/Toolbar.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as Omit<ComponentProps<typeof Toolbar>, "children">);
</script>

{#snippet children()}{#each node.children ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
{#snippet end()}{#each node.slots?.end ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}

{#if node.slots?.end}
  <Toolbar {...given} {children} {end} />
{:else}
  <Toolbar {...given} {children} />
{/if}
