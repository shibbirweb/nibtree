<script lang="ts">
  import Button from "$ui/components/Button.svelte";
  import CodeBlock from "$ui/components/CodeBlock.svelte";
  import Dialog from "$ui/components/Dialog.svelte";
  import Field from "$ui/components/Field.svelte";
  import Input from "$ui/components/Input.svelte";
  import Kbd from "$ui/components/Kbd.svelte";
  import Link from "$ui/components/Link.svelte";
  import SearchField from "$ui/components/SearchField.svelte";
  import Toolbar from "$ui/components/Toolbar.svelte";
  import SideNav from "$ui/components/SideNav.svelte";
  import Stack from "$ui/components/Stack.svelte";
  import Text from "$ui/components/Text.svelte";

  let open = $state<"message" | "form" | "split" | "panel" | "prompt" | "view" | null>(null);

  function close(): void {
    open = null;
  }
  let filter = $state("");
  let name = $state("");
  let section = $state<string | null>("editor");
  const shortcuts = [
    { label: "Go to File", keys: "⌘P" },
    { label: "Commit", keys: "⌘↩" },
  ];
</script>

<Stack direction="row" gap="sm">
  <Button onclick={() => (open = "message")}>Message</Button>
  <Button onclick={() => (open = "form")}>New Branch... (form)</Button>
  <Button onclick={() => (open = "split")}>Settings (split)</Button>
  <Button onclick={() => (open = "panel")}>Shortcuts (panel)</Button>
  <Button onclick={() => (open = "prompt")}>Password (icon)</Button>
  <Button onclick={() => (open = "view")}>Local History (view)</Button>
</Stack>
<Dialog open={open === "panel"} variant="panel" title="Keyboard Shortcuts" width="xlarge" onclose={close}>
  {#snippet toolbar()}
    <Toolbar variant="dialog" label="Filter">
      <SearchField label="Filter shortcuts" placeholder="Filter shortcuts" bind:value={filter} />
    </Toolbar>
  {/snippet}
  {#each shortcuts as shortcut (shortcut.label)}
    <Stack direction="row" align="center" justify="between" paddingY="xs">
      <Text>{shortcut.label}</Text>
      <Kbd keys={shortcut.keys} />
    </Stack>
  {/each}
  {#snippet footnote()}<Link size="small">Edit keys in Settings</Link>{/snippet}
  {#snippet actions()}<Button onclick={() => (open = null)}>Close</Button>{/snippet}
</Dialog>
<Dialog
  open={open === "prompt"}
  title="Password for github.com"
  subtitle="git asks for this to continue in storefront."
  icon="lock"
  onclose={close}
  onsubmit={() => (open = null)}
  enterSubmits
>
  <Input type="password" aria-label="Password" placeholder="Enter submits" />
  {#snippet actions()}
    <Button onclick={() => (open = null)}>Cancel</Button>
    <Button variant="primary" onclick={() => (open = null)}>Continue</Button>
  {/snippet}
</Dialog>
<Dialog open={open === "message"} title="Stash your changes?" onclose={close}>
  <Text tone="dim">Checkout needs a clean working tree.</Text>
  {#snippet actions()}
    <Button onclick={() => (open = null)}>Cancel</Button>
    <Button variant="primary" onclick={() => (open = null)}>Stash</Button>
  {/snippet}
</Dialog>
<Dialog open={open === "form"} variant="form" title="New Branch" onclose={close} onsubmit={() => (open = null)}>
  <Field label="Name" look="compact" hint="Created from main">
    <Input bind:value={name} placeholder="feature/login" width="fill" />
  </Field>
  <CodeBlock variant="command" text={`git switch -c ${name || "<name>"}`} />
  {#snippet actions()}
    <Button onclick={() => (open = null)}>Cancel</Button>
    <Button variant="primary" disabled={!name.trim()} onclick={() => (open = null)}>Create</Button>
  {/snippet}
</Dialog>
<Dialog open={open === "split"} variant="split" title="Settings" onclose={close}>
  {#snippet sidebar()}
    <SideNav
      label="Sections"
      bind:active={section}
      items={[
        { id: "appearance", label: "Appearance" },
        { id: "editor", label: "Editor" },
        { id: "git", label: "Git" },
      ]}
    />
  {/snippet}
  <Stack padding="xl"><Text variant="heading">{section}</Text></Stack>
</Dialog>
<Dialog
  open={open === "view"}
  variant="view"
  title="Local History: cart.ts"
  subtitle="storefront/src/lib"
  icon="history"
  onclose={close}
>
  <Stack direction="row" grow>
    <Stack padding="md" surface="alt"><Text>Today</Text></Stack>
    <Stack grow padding="md"><Text tone="dim">The diff goes here, filling the box.</Text></Stack>
  </Stack>
</Dialog>
