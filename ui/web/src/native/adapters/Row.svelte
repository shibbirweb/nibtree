<!-- Row in a parity scenario: its children as the content, its `actions` slot as the actions. A scenario's JSON cannot
     hold a function, so `pressable: true` stands for an `onclick`, which makes the row light up under the pointer. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Row from "../../lib/components/Row.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
  const { pressable, ...rest } = $derived(given);
</script>

{#snippet content()}{#each node.children ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
{#snippet actions()}{#each node.slots?.actions ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}

<Row
  {...rest}
  children={content}
  actions={node.slots?.actions ? actions : undefined}
  onclick={pressable ? () => {} : undefined}
/>
