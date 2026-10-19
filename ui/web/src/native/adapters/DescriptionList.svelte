<!-- DescriptionList in a parity scenario: its `value` slot is a template drawn for each item, `$value` in its texts
     replaced by the item's value. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import DescriptionList from "../../lib/components/DescriptionList.svelte";
  import type { Component, ComponentProps } from "svelte";

  // ScenarioNode passes itself in, so this file does not import it (it imports this one).
  let { node, Render }: { node: NodeData; Render: Component<{ node: NodeData }> } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof DescriptionList>);

  function filled(template: NodeData, value: string): NodeData {
    return {
      ...template,
      text: template.text?.replaceAll("$value", value),
      children: template.children?.map((child) => filled(child, value)),
    };
  }
</script>

{#if node.slots?.value}
  <DescriptionList {...given}>
    {#snippet value(item: { value: string })}{#each node.slots?.value ?? [] as child, index (index)}<Render
          node={filled(child, item.value)}
        />{/each}{/snippet}
  </DescriptionList>
{:else}
  <DescriptionList {...given} />
{/if}
