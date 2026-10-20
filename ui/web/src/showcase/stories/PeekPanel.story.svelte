<script lang="ts">
  import DiffView from "$ui/components/DiffView.svelte";
  import IconButton from "$ui/components/IconButton.svelte";
  import PeekPanel from "$ui/components/PeekPanel.svelte";
  import Segmented from "$ui/components/Segmented.svelte";

  const original = "add(item: Item): void {\n  this.items.push(item);\n}\n";
  const modified = 'add(item: Item): void {\n  this.items.push(item);\n  Queue.dispatch("added", item.id);\n}\n';
  let tone = $state<"added" | "modified" | "deleted" | "neutral">("added");
</script>

<Segmented
  label="Tone"
  bind:value={tone}
  options={[
    { value: "added", label: "Added" },
    { value: "modified", label: "Modified" },
    { value: "deleted", label: "Deleted" },
    { value: "neutral", label: "Neutral" },
  ]}
/>
<PeekPanel
  label="Change in cart.ts"
  title="cart.ts"
  detail="Working tree changes, 2 of 4 changes"
  {tone}
  height="medium"
>
  {#snippet actions()}
    <IconButton icon="plus" label="Stage this change" size="compact" />
    <IconButton icon="discard" label="Revert this change" size="compact" />
    <IconButton icon="arrow-down" label="Next change" size="compact" />
    <IconButton icon="arrow-up" label="Previous change" size="compact" />
    <IconButton icon="x" label="Close" size="compact" />
  {/snippet}
  <DiffView label="cart.ts" {original} {modified} layout="inline" language="ts" />
</PeekPanel>
