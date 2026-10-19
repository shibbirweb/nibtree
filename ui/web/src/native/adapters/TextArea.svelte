<!-- TextArea in a parity scenario: its `tools` slot as its corner buttons. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import TextArea from "../../lib/components/TextArea.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#if node.slots?.tools}
  <TextArea {...given}>
    {#snippet tools()}{#each node.slots?.tools ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
  </TextArea>
{:else}
  <TextArea {...given} />
{/if}
