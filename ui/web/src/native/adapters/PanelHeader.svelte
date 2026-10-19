<!-- PanelHeader in a parity scenario: its `actions` slot as the buttons. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import PanelHeader from "../../lib/components/PanelHeader.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof PanelHeader>);
</script>

{#if node.slots?.actions}
  <PanelHeader {...given}>
    {#snippet actions()}{#each node.slots?.actions ?? [] as child, index (index)}<Render
          node={child}
        />{/each}{/snippet}
  </PanelHeader>
{:else}
  <PanelHeader {...given} />
{/if}
