<!-- One node of a parity scenario: the ui/web component it names, with its props and its text or children, in its
     forced interaction state when it has one. -->
<script lang="ts">
  import type { Component } from "svelte";
  import type { ScenarioNode } from "../../../swift/scripts/parity/scenario";
  import Self from "./ScenarioNode.svelte";
  import ForcedState from "./ForcedState.svelte";

  let { node }: { node: ScenarioNode } = $props();

  const modules = import.meta.glob<{ default: Component<Record<string, unknown>> }>("../lib/components/*.svelte", {
    eager: true,
  });
  // A component that takes snippets has an adapter here that passes the node's slots as them.
  const adapters = import.meta.glob<{ default: Component<{ node: ScenarioNode; Render: typeof Self }> }>(
    "./adapters/*.svelte",
    {
      eager: true,
    },
  );
  const Found = $derived(modules[`../lib/components/${node.component}.svelte`]?.default);
  const Adapter = $derived(adapters[`./adapters/${node.component}.svelte`]?.default);
</script>

{#snippet drawn()}
  {#if Adapter}
    <Adapter {node} Render={Self} />
  {:else if Found && (node.text !== undefined || node.children)}
    <Found {...node.props ?? {}}>
      {#if node.text !== undefined}{node.text}{:else}{#each node.children ?? [] as child, index (index)}<Self
            node={child}
          />{/each}{/if}
    </Found>
  {:else if Found}
    <!-- No children snippet at all, so a component shows its own content (a Checkbox its label). -->
    <Found {...node.props ?? {}} />
  {/if}
{/snippet}

{#if node.state}
  <ForcedState state={node.state}>{@render drawn()}</ForcedState>
{:else}
  {@render drawn()}
{/if}
