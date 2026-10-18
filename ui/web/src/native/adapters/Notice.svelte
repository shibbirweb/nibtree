<!-- Notice in a parity scenario: the node's text or children as the message, its `action` slot as the action. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Notice from "../../lib/components/Notice.svelte";
  import type { Component } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

{#snippet message()}
  {#if node.text !== undefined}{node.text}{:else}{#each node.children ?? [] as child, index (index)}<Render
        node={child}
      />{/each}{/if}
{/snippet}

{#if node.slots?.action}
  <Notice {...given} children={message}>
    {#snippet action()}{#each node.slots?.action ?? [] as child, index (index)}<Render node={child} />{/each}{/snippet}
  </Notice>
{:else}
  <Notice {...given} children={message} />
{/if}
