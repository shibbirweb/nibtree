<!--
  The Scripts tool window: every script of the workspace
  folders' package.json, composer.json, Makefiles, deno.json and justfiles. Double-click or Enter
  runs one in a new terminal. Mounted only while it shows; the list is read again on every mount.
-->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import List from "@nibtree/ui/components/List.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import SearchField from "@nibtree/ui/components/SearchField.svelte";
  import Spacer from "@nibtree/ui/components/Spacer.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { NodeInstall, ProjectScript, ScriptSource } from "$lib/types";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import PanelHead from "$lib/views/PanelHead.svelte";
  import { type ScriptRow, scriptRows, sourceLabel } from "./scriptsModel";
  import { nodeMenu, scriptsMenu, type ScriptsMenuHost } from "./scriptsMenu";
  import { runProjectScript } from "./scriptActions";
  import { describeRun, nodePickFor, withRunner } from "./scriptRun";
  import { runnerOverrides } from "./runnerOverrides.svelte";
  import { type NodePick, nodeBadge, nodeTitle } from "./nodeVersion";

  let sources = $state.raw<ScriptSource[]>([]);
  let nodeInstalls = $state.raw<NodeInstall[]>([]);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let filter = $state("");
  let filterField = $state<HTMLInputElement | null>(null);
  let collapsed = $state.raw<Set<string>>(new Set());
  let selectedKey = $state<string | null>(null);
  let loadToken = 0;

  const folderPaths = $derived((repoStore.workspace?.folders ?? []).map((folder) => folder.root));
  const severalFolders = $derived(folderPaths.length > 1);
  const shown = $derived(sources.map((source) => withRunner(source, runnerOverrides.get(source.filePath))));
  const rows = $derived(scriptRows(shown, filter, (filePath) => collapsed.has(filePath)));
  const scriptCount = $derived(sources.reduce((sum, source) => sum + source.scripts.length, 0));
  const emptyText = $derived.by(() => {
    if (loading) {
      return "Looking for scripts...";
    }
    if (filter.trim() && scriptCount > 0) {
      return "No matching scripts";
    }
    return folderPaths.length === 0
      ? "Open a folder to see its scripts."
      : "No scripts found. Scripts come from package.json, composer.json, Makefiles, deno.json and justfiles.";
  });

  $effect(() => {
    void load(folderPaths);
  });

  /** The Node version a package.json's scripts run with; null for other kinds. */
  function nodePick(source: ScriptSource): NodePick | null {
    return nodePickFor(source, nodeInstalls, settings.scriptNodeVersions);
  }

  async function load(paths: string[]): Promise<void> {
    const token = ++loadToken;
    if (paths.length === 0) {
      sources = [];
      return;
    }
    loading = true;
    try {
      // Installed versions are read with the scripts, so Refresh also finds a newly installed one.
      const [found, installs] = await Promise.all([
        api.listProjectScripts(paths),
        api.listNodeVersions().catch(() => []),
      ]);
      if (token === loadToken) {
        sources = found ?? [];
        nodeInstalls = installs ?? [];
        loadError = null;
      }
    } catch (error) {
      if (token === loadToken) {
        loadError = errorMessage(error);
      }
    } finally {
      if (token === loadToken) {
        loading = false;
      }
    }
  }

  function run(source: ScriptSource, script: ProjectScript): void {
    void runProjectScript(source, script, nodeInstalls);
  }

  function setExpanded(filePath: string, expanded: boolean): void {
    const next = new Set(collapsed);
    if (expanded) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    collapsed = next;
  }

  const menuHost: ScriptsMenuHost = {
    get sources() {
      return sources;
    },
    get nodeInstalls() {
      return nodeInstalls;
    },
    run,
    expandAll: () => (collapsed = new Set()),
    collapseAll: () => (collapsed = new Set(sources.map((source) => source.filePath))),
    refresh: () => void load(folderPaths),
  };

  // Enter runs a script or folds a file; a click already folds a file, so a double-click does not.
  function activate(row: ScriptRow, event?: unknown): void {
    if (row.kind === "script") {
      run(row.source, row.script);
    } else if (!(event instanceof MouseEvent)) {
      setExpanded(row.source.filePath, !row.expanded);
    }
  }

  function scriptTitle(source: ScriptSource, script: ProjectScript): string {
    const command = describeRun(source, script, nodePick(source));
    return script.command ? `${command}\n${script.command}` : command;
  }
</script>

<Stack gap="none" grow>
  <PanelHead
    title="Scripts"
    hideTitle={withCommandKeys("Hide", "view.sidebar")}
    onhide={() => settings.hidePanel("scripts")}
  >
    <IconButton
      icon="chevrons-left"
      iconSize="normal"
      size="small"
      tone="dim"
      label="Collapse all"
      title="Collapse All"
      disabled={sources.length === 0}
      onclick={menuHost.collapseAll}
    />
    <IconButton
      icon="refresh"
      iconSize="medium"
      size="small"
      tone="dim"
      label="Refresh scripts"
      title="Refresh"
      disabled={loading}
      onclick={menuHost.refresh}
    />
  </PanelHead>
  <Stack paddingX="md" paddingY="sm">
    <SearchField
      size="compact"
      label="Filter scripts"
      placeholder="Filter scripts"
      bind:value={filter}
      bind:element={filterField}
      oninput={() => (selectedKey = rows.find((row) => row.kind === "script")?.key ?? null)}
    />
  </Stack>
  {#if loadError}
    <EmptyState variant="panel" title="Could not read the scripts: {loadError}" titleTone="dim" />
  {:else}
    <List
      items={rows}
      itemKey={(row) => row.key}
      label="Scripts"
      role="tree"
      height="fill"
      field={filterField}
      bind:selected={selectedKey}
      level={(row) => (row.kind === "script" ? 1 : 0)}
      expanded={(row) => (row.kind === "source" ? row.expanded : null)}
      ontoggle={(row, open) => setExpanded(row.source.filePath, open)}
      onactivate={activate}
      oncontextmenu={(event, row, fromKeys) =>
        contextMenu.open(event, scriptsMenu(row, menuHost), { keyboard: fromKeys ?? false })}
    >
      {#snippet row(row, state)}
        {#if row.kind === "source"}
          {@const label = sourceLabel(row.source, severalFolders)}
          {@const pick = row.source.error ? null : nodePick(row.source)}
          <Row
            size="tree"
            selected={state.selected}
            expanded={row.expanded}
            actionsShown="always"
            onclick={() => setExpanded(row.source.filePath, !row.expanded)}
          >
            <Icon name="file" size="normal" />
            <Text truncate title={row.source.filePath}>{label.title}</Text>
            {#if label.detail}
              <Text size="small" tone="dim" truncate giveWay>{label.detail}</Text>
            {/if}
            {#snippet actions()}
              {#if row.source.error}
                <Text title={row.source.error}><Icon name="alert" size="medium" tone="warning" /></Text>
              {:else}
                {#if pick && nodeBadge(pick)}
                  <Button
                    size="mini"
                    icon={pick.missing ? "alert" : null}
                    title="{nodeTitle(pick)}. Click to change."
                    onclick={(event: MouseEvent) => contextMenu.open(event, nodeMenu(row.source, nodeInstalls).submenu)}
                  >
                    {nodeBadge(pick)}
                  </Button>
                {/if}
                <Text size="xsmall" tone="dim">{row.source.runner}</Text>
              {/if}
            {/snippet}
          </Row>
        {:else}
          <Row size="tree" selected={state.selected} depth={1} expanded="leaf">
            <Text truncate title={scriptTitle(row.source, row.script)}>{row.script.name}</Text>
            {#if row.script.command}
              <Text size="small" tone="dim" truncate giveWay>{row.script.command}</Text>
            {/if}
            {#snippet actions()}
              <IconButton
                icon="play"
                iconSize="small"
                size="micro"
                tone="success"
                label="Run {row.script.name}"
                title="Run '{row.script.name}'"
                onclick={() => run(row.source, row.script)}
              />
            {/snippet}
          </Row>
        {/if}
      {/snippet}
      {#snippet empty()}
        <EmptyState variant="panel" titleTone="dim" title={emptyText} />
      {/snippet}
    </List>
  {/if}
</Stack>
