<!-- The AI panel in the right sidebar, like Orca's: a section per project, a card per worktree with the agents
     working in it, a filter and New Agent on top. Rows come from projects.ts, cards from panelView.ts, menus from
     panelActions.ts. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import Chip from "@nibtree/ui/components/Chip.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import ListRegion from "@nibtree/ui/components/ListRegion.svelte";
  import SearchField from "@nibtree/ui/components/SearchField.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import PanelHead from "$lib/views/PanelHead.svelte";
  import { pickAndOpenRepo } from "$lib/views/repoPicker";
  import AiPanelRows from "./AiPanelRows.svelte";
  import { aiStore } from "./aiStore.svelte";
  import { newTask, rowMenu } from "./panelActions";
  import { attentionCounts, filterRows, groupRows } from "./panelView";
  import { type PanelRow, panelRows, workspaceProjects } from "./projects";
  import { agentPrograms, agentSessions, focusSession, startMenu } from "./sessions.svelte";

  let filter = $state("");
  let selectedKey = $state<string | null>(null);
  /** Ticks every 30 s while the panel is open, for the ages. */
  let now = $state(Date.now());

  const projects = $derived(workspaceProjects(repoStore.workspace?.folders ?? [], repoStore.repos));
  const repoRoots = $derived(projects.filter((project) => project.isRepo).map((project) => project.root));
  const sessions = $derived(agentSessions());
  // A filter looks through collapsed projects too.
  const rows = $derived(
    filterRows(panelRows(projects, aiStore.worktrees, sessions, filter.trim() ? new Set() : aiStore.collapsed), filter),
  );
  const sections = $derived(groupRows(rows));
  /** Rows the keyboard moves through, in screen order. */
  const navigable = $derived(rows.filter((row) => row.kind !== "folder"));
  const counts = $derived(attentionCounts(sessions));
  const activeTab = $derived(repoStore.groups.find((group) => group.id === repoStore.focusedGroupId)?.active ?? null);
  /** Where New Agent starts: the active repository, else the first project. */
  const defaultFolder = $derived(repoStore.repo?.root ?? projects[0]?.root ?? null);
  const noAgents = $derived(agentPrograms.found !== null && agentPrograms.installed().length === 0);

  // The worktree lists follow the projects; the active repository's refs carry a worktree fingerprint,
  // so a worktree added in a terminal shows up with the next refresh of its repository.
  $effect(() => {
    const roots = repoRoots;
    void repoStore.refs;
    untrack(() => void aiStore.loadWorktrees(roots));
  });

  onMount(() => {
    void agentPrograms.load();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  function refresh(): void {
    void aiStore.loadWorktrees(repoRoots);
    void agentPrograms.load(true);
  }

  function openStartMenu(event: MouseEvent, folderPath: string): void {
    event.stopPropagation();
    contextMenu.openBelow(event.currentTarget as HTMLElement, startMenu(folderPath));
  }

  function openRowMenu(event: MouseEvent, row: PanelRow): void {
    event.stopPropagation();
    selectedKey = row.key;
    contextMenu.openBelow(event.currentTarget as HTMLElement, rowMenu(row));
  }

  function onContextMenu(event: MouseEvent, row: PanelRow): void {
    const items = rowMenu(row);
    if (items.length > 0) {
      selectedKey = row.key;
      contextMenu.open(event, items);
    }
  }

  function activate(row: PanelRow): void {
    selectedKey = row.key;
    if (row.kind === "session") {
      focusSession(row.session.terminalKey);
    } else if (row.kind === "project") {
      aiStore.toggle(row.key);
    }
  }

  function showFirstWaiting(): void {
    const waiting = sessions.find((session) => session.state === "waiting");
    if (waiting) {
      focusSession(waiting.terminalKey);
    }
  }

  function rowId(rowKey: string): string {
    return `ai-row-${encodeURIComponent(rowKey)}`;
  }

  function select(index: number): void {
    const row = navigable[index];
    if (row) {
      selectedKey = row.key;
      document.getElementById(rowId(row.key))?.scrollIntoView({ block: "nearest" });
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const index = navigable.findIndex((row) => row.key === selectedKey);
    const row = navigable[index] ?? null;
    switch (event.key) {
      case "ArrowDown":
        select(Math.min(navigable.length - 1, index + 1));
        break;
      case "ArrowUp":
        select(Math.max(0, index - 1));
        break;
      case "ArrowRight":
      case "ArrowLeft":
        if (row?.kind === "project") {
          aiStore.setExpanded(row.key, event.key === "ArrowRight");
        }
        break;
      case "Enter":
      case " ":
        if (row) {
          activate(row);
        }
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function folderName(folderPath: string | null): string {
    return folderPath ? folderPath.slice(folderPath.lastIndexOf("/") + 1) : "";
  }
</script>

<Stack grow gap="none">
  <PanelHead
    title="AI Agents"
    hideTitle={withCommandKeys("Hide", "view.aiPanel")}
    onhide={() => settings.hidePanel("ai")}
  >
    <IconButton
      icon="chevrons-left"
      iconSize="normal"
      size="compact"
      label="Collapse All"
      onclick={() => aiStore.collapseAll(rows.filter((row) => row.kind === "project").map((row) => row.key))}
      disabled={rows.length === 0}
    />
    <IconButton
      icon="refresh"
      iconSize="medium"
      size="compact"
      title="Refresh worktrees and agents"
      label="Refresh"
      onclick={refresh}
      disabled={aiStore.loading || agentPrograms.loading}
    />
  </PanelHead>

  {#if projects.length > 0 || counts.waiting > 0 || counts.working > 0}
    <Stack gap="sm" padding="md">
      {#if projects.length > 0}
        <Stack direction="row" align="center" gap="sm">
          <Stack grow>
            <SearchField size="compact" bind:value={filter} placeholder="Filter" label="Filter worktrees and agents" />
          </Stack>
          <Button
            size="small"
            variant="primary"
            icon="plus"
            title="Start an agent in {folderName(defaultFolder) || 'the active repository'}"
            disabled={defaultFolder === null}
            onclick={(event) => {
              if (defaultFolder) {
                openStartMenu(event, defaultFolder);
              }
            }}
          >
            New Agent
          </Button>
        </Stack>
      {/if}

      {#if counts.waiting > 0 || counts.working > 0}
        <Stack direction="row" gap="sm">
          {#if counts.waiting > 0}
            <Chip
              variant="badge"
              tone="warning"
              status="waiting"
              text="{counts.waiting} {counts.waiting === 1 ? 'needs you' : 'need you'}"
              title="Show the agent that needs you"
              onclick={showFirstWaiting}
            />
          {/if}
          {#if counts.working > 0}
            <Chip variant="badge" status="working" text="{counts.working} working" />
          {/if}
        </Stack>
      {/if}
    </Stack>
  {/if}

  <Stack grow gap="none" line="top">
    <ListRegion
      label="AI projects"
      role="tree"
      busy={aiStore.loading}
      activeId={selectedKey ? rowId(selectedKey) : undefined}
      onkeydown={onKeydown}
    >
      <Stack gap="xs" paddingX="md" paddingY="xs">
        <AiPanelRows
          {sections}
          {selectedKey}
          {activeTab}
          {now}
          {rowId}
          onactivate={activate}
          oncontextmenu={onContextMenu}
          onstart={openStartMenu}
          onmore={openRowMenu}
          onnewtask={newTask}
        />
        {#if projects.length === 0}
          <EmptyState
            variant="panel"
            icon="bot"
            title="No folder open"
            hint="Open a folder to see its projects and start AI agents in them."
          >
            {#snippet action()}
              <Button size="small" onclick={() => void pickAndOpenRepo()}>Open Folder...</Button>
            {/snippet}
          </EmptyState>
        {:else if rows.length === 0 && filter.trim()}
          <EmptyState variant="panel" title={`Nothing matches "${filter.trim()}".`}>
            {#snippet action()}
              <Button size="small" onclick={() => (filter = "")}>Clear Filter</Button>
            {/snippet}
          </EmptyState>
        {:else if noAgents}
          <EmptyState
            variant="notice"
            title="No AI agents found"
            hint={"Install Claude Code, Codex, Gemini CLI or another agent, then press Refresh. Blank Terminal " +
              "still works."}
          >
            {#snippet action()}
              <Button size="small" onclick={() => settings.openDialog("ai")}>AI Settings...</Button>
            {/snippet}
          </EmptyState>
        {:else if sessions.length === 0}
          <Stack paddingX="xs" paddingY="lgPlus">
            <Text size="small" tone="dim" variant="paragraph">
              Click <Text weight="semibold">New Agent</Text>, or hover a worktree and click +, to start an agent there.
              Click + next to a repository for a <Text weight="semibold">new task</Text>: its own branch and worktree,
              with one agent or several racing.
            </Text>
          </Stack>
        {/if}
      </Stack>
    </ListRegion>
  </Stack>
</Stack>
