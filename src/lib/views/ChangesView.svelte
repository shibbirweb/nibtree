<script lang="ts">
  import { withCommandKeys } from "$lib/commands/commandRuntime";
  import { tick, untrack } from "svelte";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import ListRegion from "@nibtree/ui/components/ListRegion.svelte";
  import PanelHeader from "@nibtree/ui/components/PanelHeader.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import CleanRepoList from "./changes/CleanRepoList.svelte";
  import CommitBox from "./changes/CommitBox.svelte";
  import { commitDraft } from "./changes/commitDraft.svelte";
  import { rowElementId, sameSelection, type FileSelection, type GroupId } from "./changes/fileStatus";
  import { changesLayout } from "./changes/layout.svelte";
  import { activate, discard } from "./changes/mutations";
  import RepoActions from "./changes/RepoActions.svelte";
  import RepoSection from "./changes/RepoSection.svelte";
  import {
    buildSections,
    commitChoices,
    findFile,
    findSection,
    resolveCommitTarget,
    selectableRows,
    splitSections,
  } from "./changes/sections";
  import { changesSelection } from "./changes/selection.svelte";
  import { navigation } from "$lib/stores/navigation.svelte";

  const repos = $derived(repoStore.repos);
  const multiRepo = $derived(repos.length > 1);
  const activeRoot = $derived(repoStore.repo?.root ?? null);
  const sections = $derived(buildSections(repoStore.repos, repoStore.statuses));
  const split = $derived(splitSections(sections));
  const changed = $derived(split.changed);
  const busy = $derived(repoStore.busy !== null);
  const selected = $derived(changesSelection.selected);
  /** Settings > Git > Commit box: a box at the top of each repository instead of one under the list. */
  const perRepo = $derived(settings.commitBoxLayout === "perRepo");

  let list = $state<ListRegion | null>(null);

  function isHidden(repoRoot: string, group: GroupId): boolean {
    return (multiRepo && changesLayout.isRepoCollapsed(repoRoot)) || changesLayout.isGroupCollapsed(repoRoot, group);
  }

  /** Rows reachable with the arrow keys (sections and groups that are expanded). */
  const visibleRows = $derived(selectableRows(changed, isHidden));
  const selectedSection = $derived(selected ? findSection(sections, selected.repoRoot) : null);
  const selectedFile = $derived(selected ? findFile(sections, selected) : null);
  /** Screen readers follow the selected row while the list itself has the focus. */
  const activeRowId = $derived(
    selected && visibleRows.some((row) => sameSelection(row, selected)) ? rowElementId(selected) : undefined,
  );

  const commitTarget = $derived(resolveCommitTarget(repos, changesLayout.commitTargetRoot, activeRoot));
  const commitSection = $derived(commitTarget ? findSection(sections, commitTarget.root) : null);
  const choices = $derived(commitChoices(sections, commitTarget?.root ?? null));

  // Drafts belong to the open workspace; drop those of repositories that vanished.
  $effect(() => {
    const workspaceRoot = repoStore.workspace?.root ?? null;
    const repoRoots = repos.map((repo) => repo.root);
    untrack(() => commitDraft.sync(workspaceRoot, repoRoots));
  });

  // Switching the active repository elsewhere moves the commit target along.
  $effect(() => {
    const repoRoot = activeRoot;
    untrack(() => {
      if (repoRoot && repoRoot !== changesLayout.seenActiveRoot) {
        changesLayout.seenActiveRoot = repoRoot;
        changesLayout.focusRepo(repoRoot);
      }
    });
  });

  function clickRow(selection: FileSelection): void {
    navigation.record({
      kind: "diff",
      repoRoot: selection.repoRoot,
      path: selection.path,
      area: selection.area,
      line: 0,
    });
    changesSelection.pick(selection);
    list?.focus();
  }

  // Keyboard

  async function onListKeydown(event: KeyboardEvent): Promise<void> {
    // Keys typed in a repository's commit box stay there.
    if ((event.target as HTMLElement | null)?.closest("input, textarea, select")) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visibleRows.length === 0) {
        return;
      }
      const index = selected ? visibleRows.findIndex((row) => sameSelection(row, selected)) : -1;
      let next: number;
      if (index < 0) {
        next = event.key === "ArrowDown" ? 0 : visibleRows.length - 1;
      } else {
        next = Math.max(0, Math.min(visibleRows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      }
      changesSelection.pick(visibleRows[next]);
      await tick();
      list?.reveal();
      return;
    }
    if (!selected || !selectedFile || busy) {
      return;
    }
    // Space or Enter on a focused header button runs it; do not also act on the selected row.
    if ((event.target as HTMLElement | null)?.closest("button, select, input, textarea")) {
      return;
    }
    // The list keeps the focus (rows are only its active descendant), so it handles Enter too.
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      activate(selected.repoRoot, selectedFile, selected.area);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selected.area === "unstaged") {
      event.preventDefault();
      void discard(selected.repoRoot, [selectedFile], multiRepo ? (selectedSection?.repo.name ?? null) : null);
    }
  }

  function initRepository(): void {
    const workspaceRoot = repoStore.workspace?.root ?? null;
    if (workspaceRoot) {
      void repoStore.initRepository(workspaceRoot);
    }
  }
</script>

<Stack grow gap="none" surface="panel">
  <Stack responsive>
    <PanelHeader title="Changes" count={repoStore.totalChanges > 0 ? repoStore.totalChanges : null}>
      {#snippet actions()}
        {#if repos.length > 0}
          <IconButton
            layout={perRepo ? "commit-per-repo" : "commit-single"}
            iconSize="regular"
            size="compact"
            onclick={() => settings.setPreference("commitBoxLayout", perRepo ? "single" : "perRepo")}
            title={perRepo ? "Show One Commit Box" : "Show a Commit Box per Repository"}
            label="Commit box per repository"
            aria-pressed={perRepo}
          />
        {/if}
        {#if !multiRepo && sections[0]?.status}
          <!-- One repository: its actions sit in the title bar. -->
          <RepoActions section={sections[0]} />
        {:else}
          <IconButton
            icon="refresh"
            iconSize="medium"
            size="compact"
            onclick={() => void repoStore.refreshAll()}
            title="Refresh All"
            label="Refresh all"
          />
        {/if}
        <IconButton
          icon="x"
          iconSize="normal"
          size="compact"
          onclick={() => settings.hidePanel("changes")}
          title={withCommandKeys("Hide", "view.sidebar")}
          label="Hide changes"
        />
      {/snippet}
    </PanelHeader>
  </Stack>

  {#if repoStore.workspace && repos.length === 0}
    <EmptyState
      variant="pane"
      icon="folder-git"
      iconStyle="circle"
      iconTone="accent"
      strong
      title="No git repository"
      hint="Initialize one here, or scan again after adding one."
    >
      {#snippet action()}
        <Stack direction="row" wrap justify="center" gap="md">
          <Button size="small" variant="primary" onclick={initRepository} disabled={busy}>Initialize Repository</Button>
          <Button size="small" onclick={() => void repoStore.rediscover()} disabled={busy}>Scan Again</Button>
        </Stack>
      {/snippet}
    </EmptyState>
  {:else}
    <ListRegion
      label="Changed files"
      activeId={activeRowId}
      paddingY="xs"
      onkeydown={(event) => void onListKeydown(event)}
      bind:this={list}
    >
      {#if !multiRepo}
        {#if perRepo && commitTarget && sections[0]?.status && sections[0].changeCount === 0}
          <!-- A clean repository keeps its box, for Amend. -->
          <CommitBox
            repo={commitTarget}
            stagedCount={0}
            conflictCount={0}
            multiRepo={false}
            choices={[]}
            onpick={() => {}}
            placement="section"
          />
        {/if}
        {#if sections[0]?.status && sections[0].changeCount === 0}
          <EmptyState icon="check" iconStyle="circle" iconTone="success" titleTone="dim" title="Working tree clean" />
        {:else if sections[0]}
          <RepoSection
            section={sections[0]}
            multiRepo={false}
            active={true}
            selected={selected?.repoRoot === sections[0].repo.root ? selected : null}
            onselect={clickRow}
            commitBox={perRepo}
          />
        {/if}
      {:else}
        <Stack gap="sm">
          {#if changed.length === 0}
            <EmptyState
              icon="check"
              iconStyle="circle"
              iconTone="success"
              titleTone="dim"
              title="No changes in {repos.length} repositories"
            />
          {:else}
            <Stack gap="xxs">
              {#each changed as section (section.repo.root)}
                <RepoSection
                  {section}
                  multiRepo={true}
                  active={section.repo.root === activeRoot}
                  selected={selected?.repoRoot === section.repo.root ? selected : null}
                  onselect={clickRow}
                  commitBox={perRepo}
                />
              {/each}
            </Stack>
          {/if}
          {#if split.clean.length > 0}
            <CleanRepoList sections={split.clean} {activeRoot} />
          {/if}
        </Stack>
      {/if}
    </ListRegion>
    {#if commitTarget && !perRepo}
      <CommitBox
        repo={commitTarget}
        stagedCount={commitSection?.staged.length ?? 0}
        conflictCount={commitSection?.conflicts.length ?? 0}
        {multiRepo}
        {choices}
        onpick={(repoRoot) => changesLayout.focusRepo(repoRoot)}
      />
    {/if}
  {/if}
</Stack>
