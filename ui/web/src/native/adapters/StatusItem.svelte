<!-- StatusItem in a parity scenario. A scenario's JSON cannot hold a function, so `pressable: true` stands for an
     `onclick`, which makes the item a button; its `leading` and `trailing` slots are drawn around the icon and
     words. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import StatusItem from "../../lib/components/StatusItem.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
  const { pressable, ...rest } = $derived(given);
</script>

{#snippet leading()}{#each node.slots?.leading ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
{#snippet trailing()}{#each node.slots?.trailing ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}

<StatusItem
  {...rest}
  onclick={pressable ? () => {} : undefined}
  leading={node.slots?.leading ? leading : undefined}
  trailing={node.slots?.trailing ? trailing : undefined}
/>
