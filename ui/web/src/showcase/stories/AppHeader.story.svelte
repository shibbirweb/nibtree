<script lang="ts">
  import AppHeader from "$ui/components/AppHeader.svelte";
  import Button from "$ui/components/Button.svelte";
  import Card from "$ui/components/Card.svelte";
  import Divider from "$ui/components/Divider.svelte";
  import IconButton from "$ui/components/IconButton.svelte";
  import MenuBar from "$ui/components/MenuBar.svelte";
  import Stack from "$ui/components/Stack.svelte";
  import Switch from "$ui/components/Switch.svelte";
  import Text from "$ui/components/Text.svelte";

  let busy = $state(true);
</script>

<Stack direction="row" gap="xs" align="center"><Switch label="Busy" bind:checked={busy} /><Text>Busy</Text></Stack>
<Card label="Header">
  <AppHeader busy={busy ? "Fetching origin..." : ""}>
    {#snippet start()}
      <Stack direction="row" gap="xxs">
        <IconButton icon="arrow-left" label="Go back" iconSize="regular" />
        <IconButton icon="arrow-right" label="Go forward" iconSize="regular" disabled />
      </Stack>
      <Divider direction="vertical" />
      <Button variant="ghost" icon="folder" trailingIcon="chevron-down">
        <Text weight="semibold">storefront</Text>
      </Button>
      <Text tone="faint">/</Text>
      <Button variant="ghost" icon="branch" trailingIcon="chevron-down">
        <Text>main</Text>
        <Text size="small" tone="dim">2↑ 1↓</Text>
      </Button>
    {/snippet}
    {#snippet end()}
      <IconButton icon="settings" label="Settings" iconSize="regular" />
    {/snippet}
  </AppHeader>
</Card>
<Card label="Rounded header">
  <AppHeader look="rounded">
    {#snippet start()}
      <Button variant="ghost" icon="folder" trailingIcon="chevron-down">
        <Text weight="semibold">storefront</Text>
      </Button>
    {/snippet}
  </AppHeader>
</Card>
<Card label="Project color">
  <AppHeader look="rounded" tint="red">
    {#snippet start()}
      <Button variant="ghost" icon="folder" trailingIcon="chevron-down">
        <Text weight="semibold">kpd</Text>
      </Button>
      <Button variant="ghost" icon="branch" trailingIcon="chevron-down">
        <Text>feature/queue-email</Text>
      </Button>
    {/snippet}
  </AppHeader>
</Card>
<Card label="Menu bar and project color (browser tab)">
  <AppHeader tint="cyan">
    {#snippet menuBar()}
      <MenuBar
        surface="none"
        menus={[
          { label: "File", items: [{ label: "Open Folder...", action: () => undefined }] },
          { label: "View", items: [{ label: "Word Wrap", action: () => undefined, checked: true }] },
        ]}
      />
    {/snippet}
    {#snippet start()}
      <Button variant="ghost" icon="folder" trailingIcon="chevron-down">
        <Text weight="semibold">browser-demo</Text>
      </Button>
    {/snippet}
  </AppHeader>
</Card>
