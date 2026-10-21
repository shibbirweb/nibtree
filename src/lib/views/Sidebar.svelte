<!-- The Branches and Stashes panel: local and remote branches, tags, stashes and worktrees as one tree with a
     filter. Double-click or Enter checks out; the right-click menus hold everything else. -->
<script lang="ts">
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import List from "@nibtree/ui/components/List.svelte";
  import SearchField from "@nibtree/ui/components/SearchField.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { contextMenu, type MenuItem } from "$lib/ui/menu.svelte";
  import {
    checkoutLocalBranch,
    checkoutRemoteBranch,
    checkoutTag,
    deleteLocalBranch,
    localBranchMenu,
    localSectionMenu,
    remoteBranchMenu,
    stashMenu,
    tagMenu,
  } from "./sidebar/actions";
  import PanelHead from "./PanelHead.svelte";
  import { collapse } from "./sidebar/collapse.svelte";
  import RowContent from "./sidebar/RowContent.svelte";
  import { buildRows, isCollapsible, type SidebarRow } from "./sidebar/tree";
  import { worktreeMenu, worktreeSectionMenu } from "./git/worktrees/worktreeActions";
  import { worktreeStore } from "./git/worktrees/worktreeStore.svelte";

  let filter = $state("");
  let filterField = $state<HTMLInputElement | null>(null);
  let selectedKey = $state<string | null>(null);

  const filtering = $derived(filter.trim().length > 0);
  const rows = $derived(
    buildRows({
      refs: repoStore.refs,
      stashes: repoStore.stashes,
      worktrees:
        worktreeStore.repoRoot !== null && worktreeStore.repoRoot === repoStore.repo?.root
          ? worktreeStore.list
          : undefined,
      filter,
      isExpanded: (key) => collapse.isExpanded(key, filtering),
    }),
  );

  // Worktrees are read again whenever the active repository's branches are (refs is replaced on every refresh).
  $effect(() => {
    void repoStore.refs;
    void worktreeStore.load(repoStore.repo?.root ?? null);
  });
  const hasMatches = $derived(!filtering || rows.length > 0);

  // Down or Enter in the filter then lands on the first match, not on a section.
  function filterChanged(): void {
    collapse.resetFilterState();
    selectedKey =
      rows.find((row) => row.kind !== "section" && row.kind !== "group" && row.kind !== "empty")?.key ?? null;
  }

  function toggle(row: SidebarRow): void {
    if (isCollapsible(row)) {
      collapse.toggle(row.key, filtering);
    }
  }

  function setExpanded(row: SidebarRow, expanded: boolean): void {
    if (isCollapsible(row)) {
      collapse.setExpanded(row.key, filtering, expanded);
    }
  }

  // Enter folds a section or checks out; a click already folds, so a double-click on a folder does not.
  function onActivate(row: SidebarRow, event?: unknown): void {
    if (!isCollapsible(row)) {
      activate(row);
    } else if (!(event instanceof MouseEvent)) {
      toggle(row);
    }
  }

  function activate(row: SidebarRow): void {
    if (repoStore.busy !== null) {
      return;
    }
    if (row.kind === "local") {
      if (!row.branch.isHead) {
        checkoutLocalBranch(row.branch.name);
      }
    } else if (row.kind === "remote") {
      checkoutRemoteBranch(row.branch);
    } else if (row.kind === "tag") {
      void checkoutTag(row.tagName);
    }
  }

  // Delete or Backspace on a branch deletes it; Space folds a section, like Enter.
  function onListKeydown(event: KeyboardEvent, fromField: boolean): void {
    const row = rows.find((candidate) => candidate.key === selectedKey) ?? null;
    if (fromField || !row || event.target instanceof HTMLButtonElement) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (row.kind === "local" && !row.branch.isHead && repoStore.busy === null) {
        void deleteLocalBranch(row.branch.name);
      }
    } else if (event.key === " " && isCollapsible(row)) {
      event.preventDefault();
      toggle(row);
    }
  }

  function menuFor(row: SidebarRow): MenuItem[] {
    switch (row.kind) {
      case "section":
        if (row.section === "worktrees") {
          return worktreeSectionMenu();
        }
        return row.section === "local" ? localSectionMenu() : [];
      case "local":
        return localBranchMenu(row.branch);
      case "remote":
        return remoteBranchMenu(row.branch);
      case "tag":
        return tagMenu(row.tagName);
      case "stash":
        return stashMenu(row.stash);
      case "worktree":
        return worktreeMenu(row.worktree);
      default:
        return [];
    }
  }

  function openMenu(event: MouseEvent, row: SidebarRow, fromKeys: boolean): void {
    const items = menuFor(row);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    contextMenu.open(event, items, { keyboard: fromKeys });
  }
</script>

<Stack gap="none" grow>
  <PanelHead
    title="Branches and Stashes"
    hideTitle={withCommandKeys("Hide", "view.sidebar")}
    onhide={() => settings.hidePanel("branches")}
  >
    <IconButton
      icon="refresh"
      iconSize="medium"
      size="small"
      tone="dim"
      label="Refresh branches"
      title="Refresh"
      onclick={() => {
        const repoRoot = repoStore.repo?.root ?? null;
        if (repoRoot) {
          void repoStore.refreshRepo(repoRoot);
        }
      }}
    />
  </PanelHead>
  <Stack paddingX="md" paddingY="sm">
    <SearchField
      size="compact"
      label="Filter branches and tags"
      placeholder="Filter branches and tags"
      bind:value={filter}
      bind:element={filterField}
      oninput={filterChanged}
    />
  </Stack>
  <List
    items={rows}
    itemKey={(row) => row.key}
    label="Branches, tags and stashes"
    role="tree"
    height="fill"
    field={filterField}
    bind:selected={selectedKey}
    level={(row) => row.depth}
    expanded={(row) => (isCollapsible(row) ? row.expanded : null)}
    ontoggle={setExpanded}
    onactivate={onActivate}
    oncontextmenu={(event, row, fromKeys) => openMenu(event, row, fromKeys ?? false)}
    onkeydown={onListKeydown}
  >
    {#snippet row(row, state)}
      <RowContent {row} selected={state.selected} ontoggle={() => toggle(row)} />
    {/snippet}
    {#snippet empty()}
      {#if !hasMatches}
        <EmptyState variant="panel" title="No matching branches, tags or stashes" titleTone="dim" />
      {/if}
    {/snippet}
  </List>
</Stack>
