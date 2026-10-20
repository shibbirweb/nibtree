<!-- The top bar's worktree switcher, shown while the active repository has more than one worktree: a button with
     their count, and a popup with a row per worktree (its branch and folder, changes, ahead and behind, a stopped
     merge or rebase, the last activity), read each time it opens. Picking one makes it the active repository,
     adding its folder to the workspace first when needed, so the tabs, terminals and agents of every worktree keep
     running. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import Popover from "@nibtree/ui/components/Popover.svelte";
  import PopupRow from "@nibtree/ui/components/PopupRow.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Tag from "@nibtree/ui/components/Tag.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import Time from "@nibtree/ui/components/Time.svelte";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { WorktreeSummary } from "$lib/types";
  import { toast } from "$lib/ui/toast.svelte";
  import { changesText, type SwitcherRow, switchAction, switcherRows } from "./switcherModel";
  import { openNewWorktreeDialog, showWorktrees } from "./worktreeActions";
  import { worktreeStore } from "./worktreeStore.svelte";

  let open = $state(false);
  let summaries = $state.raw<WorktreeSummary[] | null>(null);
  const repoRoot = $derived(repoStore.repo?.root ?? null);
  const list = $derived(
    worktreeStore.repoRoot !== null && worktreeStore.repoRoot === repoRoot ? worktreeStore.list : [],
  );
  const rows = $derived(summaries ? switcherRows(summaries) : []);

  // The plain list (folders only, no status walk) tells whether there is anything to switch to.
  $effect(() => {
    void repoStore.refs;
    void worktreeStore.load(repoRoot);
  });

  // Each opening reads every worktree's state afresh; nothing runs while the popup is closed.
  $effect(() => {
    if (!open || !repoRoot) {
      return;
    }
    const root = repoRoot;
    summaries = null;
    api
      .worktreeSummaries(root)
      .then((loaded) => {
        if (open && repoRoot === root) {
          summaries = loaded;
        }
      })
      .catch((error) => {
        open = false;
        toast.error("Could not read the worktrees", errorMessage(error));
      });
  });

  async function pick(row: SwitcherRow): Promise<void> {
    const action = switchAction(
      row,
      repoStore.repos.map((repo) => repo.root),
    );
    open = false;
    if (action === "join") {
      await repoStore.addFolder(row.path);
    }
    if (action !== "none" && repoStore.repos.some((repo) => repo.root === row.path)) {
      await repoStore.setActiveRepo(row.path);
    }
  }

  function rowTitle(row: SwitcherRow): string {
    if (row.unavailable) {
      return `${row.path}\n${row.unavailable}`;
    }
    return row.current ? `${row.path}\nThe active worktree` : `${row.path}\nSwitch to it, keeping the others open`;
  }
</script>

{#if list.length > 1}
  <Popover bind:open label="Worktrees" align="start" width="large" layer="window">
    {#snippet trigger({ toggle })}
      <Button
        variant="ghost"
        icon="folder-tree"
        trailingIcon="chevron-down"
        aria-haspopup="dialog"
        count={list.length}
        title="Worktrees: {list.length}. Click to switch"
        onclick={toggle}
      />
    {/snippet}
    {#if summaries === null}
      <Text size="small" tone="dim">Reading worktrees...</Text>
    {:else}
      {#each rows as row (row.path)}
        <Row
          size="entry"
          align="baseline"
          selected={row.current}
          disabled={row.unavailable !== null}
          cursor={row.current || row.unavailable ? "default" : "pointer"}
          title={rowTitle(row)}
          onclick={() => void pick(row)}
        >
          <Icon name={row.current ? "check" : "folder-tree"} size="compact" />
          <Stack gap="xxs" grow>
            <Stack direction="row" gap="sm" align="center">
              <Text weight={row.current ? "semibold" : "regular"} truncate>{row.label}</Text>
              <Text size="small" tone="dim" truncate>{row.folder}</Text>
              {#if row.isMain}
                <Tag size="small" variant="outline">main</Tag>
              {/if}
            </Stack>
            <Stack direction="row" gap="sm" align="center">
              {#if row.unavailable}
                <Text size="small" tone="faint">{row.unavailable}</Text>
              {/if}
              {#if row.busy}
                <Tag size="small" tone="warning">{row.busy}</Tag>
              {/if}
              {#if row.conflicts > 0}
                <Tag size="small" tone="danger">{row.conflicts === 1 ? "1 conflict" : `${row.conflicts} conflicts`}</Tag
                >
              {/if}
              {#if changesText(row.changes)}
                <Text size="small" tone="accent">{changesText(row.changes)}</Text>
              {/if}
              {#if row.ahead > 0}
                <Text size="small" tone="dim" title="Commits to push">{row.ahead}&uarr;</Text>
              {/if}
              {#if row.behind > 0}
                <Text size="small" tone="dim" title="Commits to pull">{row.behind}&darr;</Text>
              {/if}
              {#if row.lastActivity !== null}
                <Text size="small" tone="faint"><Time time={row.lastActivity} /></Text>
              {/if}
            </Stack>
          </Stack>
        </Row>
      {/each}
    {/if}
    <Divider />
    <PopupRow
      variant="action"
      icon="plus"
      label="New Worktree..."
      onclick={() => {
        open = false;
        openNewWorktreeDialog(repoRoot);
      }}
    />
    <PopupRow
      variant="action"
      icon="list-tree"
      label="Show Worktrees"
      onclick={() => {
        open = false;
        showWorktrees();
      }}
    />
  </Popover>
{/if}
