<!-- The open and save dialog of the app in a browser tab, which cannot show the system's: the folders and files of
     the machine running the app (browse_folder). Click selects, double-click opens a folder or chooses a file; the
     path field takes a typed path with Enter. See pathPickerModel.ts. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import ListBox from "@nibtree/ui/components/ListBox.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { api, errorMessage } from "$lib/api";
  import type { BrowseListing } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { pathPicker } from "./pickerStore.svelte";
  import { chosenPath, pickStart, saveName, shownEntries, type PickRequest } from "./pathPickerModel";

  let { request }: { request: PickRequest } = $props();

  let listing = $state.raw<BrowseListing | null>(null);
  let error = $state("");
  let typedPath = $state("");
  let selected = $state<string | null>(null);
  // AppOverlays makes a new picker for each question, so where it starts is read once.
  const start = untrack(() => pickStart(request));
  let name = $state(start.name);
  let showHidden = $state(false);

  const entries = $derived(listing ? shownEntries(listing.entries, request, showHidden) : []);
  const selectedEntry = $derived(entries.find((entry) => entry.name === selected) ?? null);
  const actionLabel = $derived(request.mode === "save" ? "Save" : request.mode === "folder" ? "Select Folder" : "Open");
  const canChoose = $derived(
    listing !== null &&
      (request.mode === "folder" ||
        (request.mode === "file" && selectedEntry !== null && !selectedEntry.isDir) ||
        (request.mode === "save" && saveName(name, request.filters) !== "")),
  );

  void go(start.folderPath ?? pathPicker.lastFolder);

  async function go(folderPath: string | null): Promise<void> {
    try {
      const next = await api.browseFolder(folderPath);
      listing = next;
      typedPath = next.folderPath;
      selected = null;
      error = "";
    } catch (failure) {
      // A typed path that does not open keeps the folder shown and says why.
      error = errorMessage(failure);
      if (listing === null && folderPath !== null) {
        await go(null);
      }
    }
  }

  function activate(entryName: string, isDir: boolean): void {
    if (!listing) {
      return;
    }
    if (isDir) {
      void go(chosenPath(listing.folderPath, entryName));
    } else if (request.mode === "file") {
      pathPicker.answer(chosenPath(listing.folderPath, entryName), listing.folderPath);
    } else if (request.mode === "save") {
      name = entryName;
    }
  }

  async function choose(): Promise<void> {
    if (!listing || !canChoose) {
      return;
    }
    if (request.mode === "save") {
      const fileName = saveName(name, request.filters);
      const exists = listing.entries.some((entry) => entry.name === fileName && !entry.isDir);
      if (
        exists &&
        !(await dialogs.confirm({ title: `Replace ${fileName}?`, confirmLabel: "Replace", danger: true }))
      ) {
        return;
      }
      pathPicker.answer(chosenPath(listing.folderPath, fileName), listing.folderPath);
      return;
    }
    const folderChoice = request.mode === "folder" && selectedEntry?.isDir ? selectedEntry.name : null;
    const path = chosenPath(listing.folderPath, request.mode === "folder" ? folderChoice : selected);
    pathPicker.answer(path, listing.folderPath);
  }
</script>

<Dialog
  open
  variant="form"
  title={request.title}
  width="medium"
  onclose={() => pathPicker.answer(null)}
  onsubmit={() => void choose()}
>
  <Stack direction="row" gap="xs" align="center">
    <IconButton
      icon="arrow-up"
      label="Enclosing folder"
      disabled={!listing?.parentPath}
      onclick={() => void go(listing?.parentPath ?? null)}
    />
    <IconButton icon="folder" label="Home folder" onclick={() => void go(null)} />
    <Stack grow>
      <Input
        mono
        width="fill"
        aria-label="Folder"
        bind:value={typedPath}
        spellcheck="false"
        autocomplete="off"
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void go(typedPath.trim() || null);
          }
        }}
      />
    </Stack>
  </Stack>
  {#if error}
    <Text tone="danger" size="small">{error}</Text>
  {/if}
  <ListBox label="Folder contents" maxHeight="large" minHeight="list">
    {#if listing && entries.length === 0}
      <EmptyState title={request.mode === "folder" ? "No folders here" : "Nothing to show here"} titleTone="dim" />
    {/if}
    {#each entries as entry (entry.name)}
      <Row
        line
        selected={entry.name === selected}
        title={entry.name}
        onclick={() => (selected = entry.name)}
        ondblclick={() => activate(entry.name, entry.isDir)}
      >
        <Icon name={entry.isDir ? "folder" : "file"} size="regular" tone="dim" />
        <Text truncate>{entry.name}</Text>
      </Row>
    {/each}
  </ListBox>
  {#if request.mode === "save"}
    <Field label="Name" look="compact">
      <Input mono width="fill" bind:value={name} spellcheck="false" autocomplete="off" autofocus />
    </Field>
  {/if}
  {#snippet footnote()}
    <Checkbox size="small" label="Show hidden" bind:checked={showHidden} />
  {/snippet}
  {#snippet actions()}
    <Button onclick={() => pathPicker.answer(null)}>Cancel</Button>
    <Button variant="primary" disabled={!canChoose} onclick={() => void choose()}>{actionLabel}</Button>
  {/snippet}
</Dialog>
