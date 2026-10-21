<!-- Rollback Changes: the changed tracked files with checkboxes; their staged and
     unstaged changes go back to HEAD. New files are removed from Git, and deleted when asked. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import FileRow from "@nibtree/ui/components/FileRow.svelte";
  import ListBox from "@nibtree/ui/components/ListBox.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { api } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { rowKind, splitPath, stagingNote } from "$lib/views/changes/fileStatus";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { addedFiles, rollbackCandidates, rollbackPaths } from "./gitOptions";

  interface Props {
    repoRoot: string;
    /** Files to start with ticked; null ticks every one. */
    filePaths: string[] | null;
  }

  let { repoRoot, filePaths }: Props = $props();

  const candidates = $derived(rollbackCandidates(repoStore.statuses[repoRoot]?.files ?? []));
  let checked = $state<Record<string, boolean>>(
    untrack(() =>
      Object.fromEntries(candidates.map((file) => [file.path, filePaths === null || filePaths.includes(file.path)])),
    ),
  );
  let deleteAdded = $state(false);

  const selected = $derived(candidates.filter((file) => checked[file.path] ?? false));
  const selectedAdded = $derived(addedFiles(selected));
  const allChecked = $derived(candidates.length > 0 && selected.length === candidates.length);

  function toggleAll(): void {
    const next = !allChecked;
    checked = Object.fromEntries(candidates.map((file) => [file.path, next]));
  }

  function close(): void {
    gitDialogs.close();
  }

  async function submit(): Promise<void> {
    const files = selected;
    if (files.length === 0 || repoStore.busy !== null) {
      return;
    }
    const parts = [
      files.length === 1
        ? `Changes to ${files[0].path} will be lost.`
        : `Changes to ${files.length} files will be lost.`,
    ];
    const added = selectedAdded.length;
    if (added > 0) {
      parts.push(
        deleteAdded
          ? `${added === 1 ? "1 new file" : `${added} new files`} will be deleted.`
          : `${added === 1 ? "1 new file stays" : `${added} new files stay`} on disk, untracked.`,
      );
    }
    parts.push("This cannot be undone.");
    const confirmed = await dialogs.confirm({
      title: "Rollback Changes",
      message: parts.join(" "),
      confirmLabel: "Rollback",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const paths = rollbackPaths(files);
    const remove = deleteAdded;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await repoStore.run("Rollback", (repoPath) => api.rollbackFiles(repoPath, paths, remove), {
      repoPath: targetRepo,
      success: files.length === 1 ? `Rolled back ${files[0].path}` : `Rolled back ${files.length} files`,
    });
  }
</script>

<Dialog open variant="form" title="Rollback Changes" width="medium" onclose={close} onsubmit={() => void submit()}>
  {#if candidates.length === 0}
    <Text tone="dim">There are no changes to tracked files.</Text>
  {:else}
    <Checkbox checked={allChecked} onchange={toggleAll}>
      {selected.length} of {candidates.length}
      {candidates.length === 1 ? "file" : "files"}
    </Checkbox>
    <ListBox label="Files to roll back" maxHeight="large">
      {#each candidates as file (file.path)}
        {@const parts = splitPath(file.path)}
        <FileRow
          variant="list"
          kind={rowKind(file)}
          name={parts.name}
          directory={parts.directory}
          note={stagingNote(file)}
          title={file.origPath ? `${file.origPath} -> ${file.path}` : file.path}
          bind:checked={checked[file.path]}
        />
      {/each}
    </ListBox>
    {#if selectedAdded.length > 0}
      <Checkbox bind:checked={deleteAdded} label="Delete local copies of added files" />
    {/if}
  {/if}

  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button
      variant="danger-primary"
      disabled={selected.length === 0 || repoStore.busy !== null}
      onclick={() => void submit()}
    >
      Rollback
    </Button>
  {/snippet}
</Dialog>
