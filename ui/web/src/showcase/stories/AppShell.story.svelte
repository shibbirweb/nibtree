<script lang="ts">
  import ActivityBar from "$ui/components/ActivityBar.svelte";
  import AppShell from "$ui/components/AppShell.svelte";
  import EmptyState from "$ui/components/EmptyState.svelte";
  import Notice from "$ui/components/Notice.svelte";
  import Segmented from "$ui/components/Segmented.svelte";
  import Stack from "$ui/components/Stack.svelte";
  import StatusBar from "$ui/components/StatusBar.svelte";
  import StatusItem from "$ui/components/StatusItem.svelte";
  import Text from "$ui/components/Text.svelte";

  let look = $state<"flat" | "rounded">("flat");
  let left = $state<string | null>("changes");
  let sidebarWidth = $state(220);
  let bottomHeight = $state(90);
</script>

<Stack direction="row" gap="lg" align="center">
  <Segmented
    label="Look"
    bind:value={look}
    options={[
      { value: "flat", label: "Flat" },
      { value: "rounded", label: "Rounded" },
    ]}
  />
  <Text tone="dim">Sidebar {sidebarWidth}px, bottom {bottomHeight}px</Text>
</Stack>
<AppShell {look} height="large" bind:sidebarWidth bind:bottomHeight>
  {#snippet leftBar()}
    <ActivityBar
      label="Side panels"
      bind:active={left}
      items={[
        { id: "changes", icon: "git-compare", label: "Changes" },
        { id: "log", icon: "history", label: "Log" },
      ]}
    />
  {/snippet}
  {#snippet banners()}
    <Notice variant="banner" tone="danger" icon="alert">
      <Text weight="semibold">Merging feature into main</Text>
      <Text tone="dim">&middot; 2 files have conflicts</Text>
    </Notice>
  {/snippet}
  {#snippet sidebar()}<EmptyState title="Sidebar" hint={left ?? "closed"} />{/snippet}
  {#snippet editor()}<EmptyState title="Editor" hint="Keeps at least 360 px" />{/snippet}
  {#snippet bottom()}<EmptyState title="Terminal" />{/snippet}
  {#snippet statusBar()}
    <StatusBar>
      {#snippet start()}<StatusItem icon="branch" text="main" />{/snippet}
    </StatusBar>
  {/snippet}
</AppShell>
