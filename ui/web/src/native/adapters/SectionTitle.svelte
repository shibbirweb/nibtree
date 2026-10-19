<!-- SectionTitle in a parity scenario: its `actions` slot as the buttons. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import SectionTitle from "../../lib/components/SectionTitle.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof SectionTitle>);
</script>

{#if node.slots?.actions}
  <SectionTitle {...given}>
    {#snippet actions()}{#each node.slots?.actions ?? [] as child, index (index)}<Render
          node={child}
        />{/each}{/snippet}
  </SectionTitle>
{:else}
  <SectionTitle {...given} />
{/if}
