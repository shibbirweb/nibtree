<!-- Main-area view showing the diff of the change selected in the Changes sidebar. -->
<script lang="ts">
  import type { PreviewSides } from "$lib/diff/binaryPreview";
  import GitDiffView from "$lib/diff/GitDiffView.svelte";
  import type { BlameTarget } from "$lib/editor/blame";
  import { joinPath } from "$lib/stores/workspacePaths";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import Spacer from "@nibtree/ui/components/Spacer.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import { HEAD_REVISION, INDEX_REVISION } from "$lib/views/files/previewSource";
  import { buildSections, displayPath, findFile, findSection, splitSections } from "./sections";
  import { changesSelection } from "./selection.svelte";
  import { navigation } from "$lib/stores/navigation.svelte";
  import { untrack } from "svelte";

  let reveal = $state<{ line: number; token: number } | null>(null);

  // Back / Forward to a line in this diff.
  $effect(() => {
    const request = navigation.diffReveal;
    const current = changesSelection.selected;
    if (request && current) {
      untrack(() => {
        const taken = navigation.takeDiffReveal(current.repoRoot, current.path, current.area);
        if (taken) {
          reveal = taken;
        }
      });
    }
  });

  const sections = $derived(buildSections(repoStore.repos, repoStore.statuses));
  const changed = $derived(splitSections(sections).changed);
  const multiRepo = $derived(repoStore.repos.length > 1);
  const anyLoaded = $derived(sections.some((section) => section.status !== null));
  const conflictTotal = $derived(changed.reduce((sum, section) => sum + section.conflicts.length, 0));
  const selected = $derived(changesSelection.selected);
  const selectedSection = $derived(selected ? findSection(sections, selected.repoRoot) : null);
  const diffMode = $derived(selected?.area === "staged" ? "staged" : "unstaged");
  const panelHidden = $derived(!settings.panelShown("changes"));

  /** Blame of the work tree text; a clicked line goes back to this diff. */
  const blameTarget = $derived.by((): BlameTarget | null => {
    const current = selected;
    if (!current) {
      return null;
    }
    const { repoRoot, path, area } = current;
    return {
      repoRoot,
      filePath: path,
      revision: null,
      origin: (line) => ({ kind: "diff", repoRoot, path, area, line }),
    };
  });

  /** Bumped when the repository's status changes, so a binary preview loads its files again. */
  let previewVersion = $state(0);
  $effect(() => {
    void repoStore.statuses[selected?.repoRoot ?? ""];
    void repoStore.fileVersions[selected?.repoRoot ?? ""];
    untrack(() => previewVersion++);
  });
  /** Unstaged: the index against the work tree. Staged: HEAD (the old path of a rename) against the index. */
  const previewSides = $derived.by((): PreviewSides | null => {
    if (!selected) {
      return null;
    }
    const index = {
      kind: "revision",
      repoRoot: selected.repoRoot,
      revision: INDEX_REVISION,
      filePath: selected.path,
    } as const;
    if (selected.area === "staged") {
      const oldPath = findFile(sections, selected)?.origPath ?? selected.path;
      const head = {
        kind: "revision",
        repoRoot: selected.repoRoot,
        revision: HEAD_REVISION,
        filePath: oldPath,
      } as const;
      return { original: head, modified: index, version: previewVersion };
    }
    const worktree = { kind: "worktree", filePath: joinPath(selected.repoRoot, selected.path) } as const;
    return { original: index, modified: worktree, version: previewVersion };
  });
</script>

<Stack gap="none" grow surface="editor">
  {#if repoStore.repos.length === 0}
    <EmptyState titleTone="dim" title="This folder has no git repository yet." />
  {:else if !anyLoaded}
    <Spacer />
  {:else if selected && changesSelection.diff}
    <GitDiffView
      source={{
        kind: "changes",
        repoRoot: selected.repoRoot,
        filePath: selected.path,
        area: selected.area === "staged" ? "staged" : "unstaged",
        status: findFile(sections, selected),
      }}
      diff={changesSelection.diff}
      path={displayPath(selectedSection?.repo ?? null, selected.path, multiRepo)}
      labels={diffMode === "staged"
        ? { left: "HEAD", right: "Index (staged)" }
        : { left: "Index", right: "Working Tree" }}
      onChange={(target, content) => changesSelection.applyDiffChange(target, content)}
      onLines={(action, lineSelection, wholeChange) =>
        void changesSelection.applyLines(action, lineSelection, wholeChange)}
      blame={blameTarget}
      revealLine={reveal}
      {previewSides}
    />
  {:else if selected && changesSelection.diffError}
    <EmptyState titleTone="danger" strong title="Could not load the diff" hint={changesSelection.diffError} />
  {:else if selected}
    <EmptyState titleTone="dim" title="Loading diff..." delayed />
  {:else if changed.length === 0}
    <EmptyState
      icon="check"
      iconStyle="circle"
      iconTone="success"
      strong
      title={multiRepo ? `No changes in ${repoStore.repos.length} repositories` : "Working tree clean"}
      hint="There are no changes to commit."
    />
  {:else}
    <EmptyState
      titleTone="dim"
      title={conflictTotal > 0 ? "Resolve conflicts to continue" : "Select a file in Changes to see its diff"}
    >
      {#snippet action()}
        {#if panelHidden}
          <Button size="small" icon="git-compare" onclick={() => settings.setLeftPanel("changes")}>Show Changes</Button>
        {/if}
      {/snippet}
    </EmptyState>
  {/if}
</Stack>
