<!-- Everything a window draws over its screen: Settings, update and What's New dialogs, sign-in prompts, Quick
     Open, Local History, the MCP tools, the opening progress, toasts, Git dialogs, confirms and context menus. -->
<script lang="ts">
  import AskpassDialog from "$lib/askpass/AskpassDialog.svelte";
  import { isBrowserHost } from "$lib/browser/host";
  import PathPicker from "$lib/browser/PathPicker.svelte";
  import { pathPicker } from "$lib/browser/pickerStore.svelte";
  import { helpDialogs } from "$lib/help/helpDialogs.svelte";
  import { localHistory } from "$lib/localHistory/localHistory.svelte";
  import { mcpStore } from "$lib/mcp/mcpStore.svelte";
  import { quickOpen } from "$lib/quickOpen/quickOpenStore.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { LaunchMode } from "$lib/types";
  import ContextMenuHost from "$lib/ui/ContextMenuHost.svelte";
  import DialogHost from "$lib/ui/DialogHost.svelte";
  import Toasts from "$lib/ui/Toasts.svelte";
  import UpdateDialog from "$lib/update/UpdateDialog.svelte";
  import { updates } from "$lib/update/updates.svelte";
  import WhatsNewDialog from "$lib/update/WhatsNewDialog.svelte";
  import GitDialogHost from "$lib/views/git/GitDialogHost.svelte";
  import OpeningProgress from "$lib/views/OpeningProgress.svelte";
  import SettingsDialog from "$lib/views/SettingsDialog.svelte";

  let { launch }: { launch: LaunchMode | null } = $props();
</script>

{#if settings.dialogOpen}
  <SettingsDialog />
{/if}

{#if updates.dialogOpen}
  <UpdateDialog />
{/if}

{#if updates.whatsNewOpen}
  <WhatsNewDialog />
{/if}

<AskpassDialog />

<!-- The open and save dialog of the app in a browser tab, which has no system one. -->
{#if isBrowserHost() && pathPicker.request}
  {#key pathPicker.request}
    <PathPicker request={pathPicker.request} />
  {/key}
{/if}

{#if helpDialogs.shortcutsOpen}
  {#await import("$lib/help/ShortcutsDialog.svelte") then module}
    <module.default />
  {/await}
{/if}

<!-- Quick Open and the Command Palette (Cmd+P, Shift+Cmd+P); also on the welcome screen. -->
{#if quickOpen.isOpen && launch?.mode === "app"}
  {#await import("$lib/quickOpen/QuickOpen.svelte") then module}
    <module.default />
  {/await}
{/if}

{#if localHistory.target && launch?.mode === "app"}
  {#await import("$lib/localHistory/LocalHistoryDialog.svelte") then module}
    <module.default />
  {/await}
{/if}

{#if mcpStore.toolsDialogOpen}
  {#await import("$lib/mcp/McpToolsDialog.svelte") then module}
    <module.default />
  {/await}
{/if}

<OpeningProgress />
<Toasts />
{#if launch?.mode !== "mergeTool"}
  <GitDialogHost />
{/if}
<DialogHost />
<ContextMenuHost />
