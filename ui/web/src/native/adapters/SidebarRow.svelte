<!-- SidebarRow in a parity scenario: its `actions` slot as the row's buttons. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import SidebarRow from "../../lib/components/SidebarRow.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof SidebarRow>);
</script>

{#if node.slots?.actions}
  <SidebarRow {...given}>
    {#snippet actions()}{#each node.slots?.actions ?? [] as child, index (index)}<Render
          node={child}
        />{/each}{/snippet}
  </SidebarRow>
{:else}
  <SidebarRow {...given} />
{/if}
