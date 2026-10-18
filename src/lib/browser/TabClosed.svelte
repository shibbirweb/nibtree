<!-- What a browser tab shows after Close Window when the browser keeps the tab open (see closedTab.svelte.ts). -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
</script>

<Stack gap="none" height="window" surface="panel">
  <EmptyState
    title="This window is closed"
    hint="Close this browser tab, or open the window again."
    icon="info"
    iconStyle="large-circle"
    titleSize="large"
  >
    {#snippet action()}
      <Button variant="primary" onclick={() => location.reload()}>Open Again</Button>
    {/snippet}
  </EmptyState>
</Stack>
