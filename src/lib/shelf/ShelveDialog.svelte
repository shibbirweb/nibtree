<!-- Shelve Changes: a name, the changed files with checkboxes (staged, unstaged and new
     files) and "Keep changes in the working tree". The changes are saved as a patch on the shelf,
     then taken out of the work tree unless kept. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import FileRow from "@nibtree/ui/components/FileRow.svelte";
  import ListBox from "@nibtree/ui/components/ListBox.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { rowKind, splitPath, stagingNote } from "$lib/views/changes/fileStatus";
  import { gitDialogs } from "$lib/views/git/gitDialogs.svelte";
  import { shelveFiles } from "./shelfActions.svelte";
  import { defaultShelfName, shelveCandidates } from "./shelfModel";

  interface Props {
    repoRoot: string;
    /** Files to start with ticked; null ticks every one. */
    filePaths: string[] | null;
  }

  let { repoRoot, filePaths }: Props = $props();

  const candidates = $derived(shelveCandidates(repoStore.statuses[repoRoot]?.files ?? []));
  const conflicted = $derived((repoStore.statuses[repoRoot]?.files ?? []).filter((file) => file.conflicted).length);
  const conflictNote = $derived(
    `${conflicted === 1 ? "1 conflicted file is" : `${conflicted} conflicted files are`} left out: ` +
      "resolve conflicts first.",
  );
  let checked = $state<Record<string, boolean>>(
    untrack(() =>
      Object.fromEntries(
        candidates.map((file) => [
          file.path,
          filePaths === null ||
            filePaths.includes(file.path) ||
            (file.origPath !== null && filePaths.includes(file.origPath)),
        ]),
      ),
    ),
  );
  let name = $state(untrack(() => defaultShelfName(repoStore.statuses[repoRoot]?.head.branch ?? null, new Date())));
  let keepInWorkingTree = $state(false);

  const selected = $derived(candidates.filter((file) => checked[file.path] ?? false));
  const allChecked = $derived(candidates.length > 0 && selected.length === candidates.length);
  const canSubmit = $derived(selected.length > 0 && name.trim() !== "" && repoStore.busy === null);

  function toggleAll(): void {
    const next = !allChecked;
    checked = Object.fromEntries(candidates.map((file) => [file.path, next]));
  }

  function close(): void {
    gitDialogs.close();
  }

  async function submit(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    const paths = selected.flatMap((file) => (file.origPath ? [file.path, file.origPath] : [file.path]));
    const shelfName = name.trim();
    const keep = keepInWorkingTree;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await shelveFiles(targetRepo, shelfName, paths, keep);
  }
</script>

<Dialog open variant="form" title="Shelve Changes" width="medium" onclose={close} onsubmit={() => void submit()}>
  <Field label="Name" look="compact">
    <Input width="fill" bind:value={name} spellcheck="false" autocomplete="off" autofocus />
  </Field>
  {#if candidates.length === 0}
    <Text tone="dim">There are no changes to shelve.</Text>
  {:else}
    <Checkbox checked={allChecked} onchange={toggleAll}>
      {selected.length} of {candidates.length}
      {candidates.length === 1 ? "file" : "files"}
    </Checkbox>
    <ListBox label="Files to shelve" maxHeight="large">
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
  {/if}
  {#if conflicted > 0}
    <Text variant="hint" tone="faint">
      {conflictNote}
    </Text>
  {/if}
  <Checkbox bind:checked={keepInWorkingTree} label="Keep changes in the working tree" />

  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canSubmit} onclick={() => void submit()}>Shelve</Button>
  {/snippet}
</Dialog>
