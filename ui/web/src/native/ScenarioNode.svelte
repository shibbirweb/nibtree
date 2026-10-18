<!-- One node of a parity scenario: the ui/web component it names, with its props and its text or children. -->
<script lang="ts">
  import type { Component } from "svelte";
  import type { ScenarioNode } from "../../../swift/scripts/parity/scenario";
  import Self from "./ScenarioNode.svelte";

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

{#if Adapter}
  <Adapter {node} Render={Self} />
{:else if Found}
  <Found {...node.props ?? {}}>
    {#if node.text !== undefined}{node.text}{:else}{#each node.children ?? [] as child, index (index)}<Self
          node={child}
        />{/each}{/if}
  </Found>
{/if}
