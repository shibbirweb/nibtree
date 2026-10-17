<!-- The merge tool over the whole window, opened from a conflicted file: loads the conflict, offers whole-file
     choices for binary and deleted files, and otherwise shows MergeEditor. -->
<script lang="ts">
  import AppHeader from "@nibtree/ui/components/AppHeader.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import CodeBlock from "@nibtree/ui/components/CodeBlock.svelte";
  import EmptyState from "@nibtree/ui/components/EmptyState.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import WindowLayer from "@nibtree/ui/components/WindowLayer.svelte";
  import { onMount } from "svelte";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { windowChrome } from "$lib/stores/windowChrome.svelte";
  import type { MergeDocument, Side } from "$lib/types";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import MergeEditor from "./MergeEditor.svelte";

  let { repoPath, conflictPath }: { repoPath: string; conflictPath: string } = $props();

  let doc = $state.raw<MergeDocument | null>(null);
  let loadError = $state<string | null>(null);
  let version = $state(0);
  /** The user chose to merge a modify/delete conflict as text. */
  let forceText = $state(false);
  let editor = $state<ReturnType<typeof MergeEditor> | null>(null);

  onMount(() => {
    void load(settings.ignoreWhitespace);
  });

  async function load(ignoreWhitespace: boolean): Promise<void> {
    try {
      doc = await api.loadConflict(repoPath, conflictPath, ignoreWhitespace);
      loadError = null;
      version++;
    } catch (error) {
      loadError = errorMessage(error);
    }
  }

  function reload(ignoreWhitespace: boolean): void {
    settings.ignoreWhitespace = ignoreWhitespace;
    settings.save();
    void load(ignoreWhitespace);
  }

  async function applyResult(content: string): Promise<void> {
    const current = doc;
    if (!current) {
      return;
    }
    const saved = await repoStore.run(
      "Save resolution",
      (path) => api.saveResolution(path, conflictPath, content, current.eol).then(() => true),
      { success: `Resolved ${conflictPath}` },
    );
    if (saved) {
      repoStore.closeMerge();
    }
  }

  async function acceptSide(side: Side): Promise<void> {
    const done = await repoStore.run(
      side === "ours" ? "Accept yours" : "Accept theirs",
      (path) => api.acceptSide(path, [conflictPath], side).then(() => true),
      { success: `Resolved ${conflictPath}` },
    );
    if (done) {
      repoStore.closeMerge();
    }
  }

  /** The close button works like Cancel, so an edited result is only discarded after asking. */
  function close(): void {
    if (editor) {
      void editor.cancel();
    } else {
      repoStore.closeMerge();
    }
  }

  const fileLevelReason = $derived.by(() => {
    if (!doc) {
      return null;
    }
    if (doc.binary) {
      return "This file is binary, so it can only be resolved by picking one version.";
    }
    if (forceText) {
      return null;
    }
    if (doc.kind === "deletedByUs") {
      return "This file was deleted on your side and modified on theirs.";
    }
    if (doc.kind === "deletedByThem") {
      return "This file was modified on your side and deleted on theirs.";
    }
    return null;
  });
</script>

<WindowLayer label="Merge {conflictPath}">
  <!-- It covers the window's top bar, so on macOS the window's own buttons sit at its left and it moves the window. -->
  <AppHeader windowControls={windowChrome.controlsInBar}>
    {#snippet start()}
      <Icon name="merge" size="regular" tone="dim" />
      <Text weight="semibold">Merge Revisions for</Text>
      <Text mono truncate selectable>{conflictPath}</Text>
    {/snippet}
    {#snippet end()}
      <IconButton icon="x" iconSize="regular" label="Close merge" title="Close" onclick={close} />
    {/snippet}
  </AppHeader>
  <Stack gap="none" grow>
    {#if loadError}
      <EmptyState icon="alert" title="Could not load this conflict.">
        {#snippet action()}
          <Stack gap="md" align="center">
            <CodeBlock variant="detail" text={loadError ?? ""} label="Error" />
            <Button onclick={() => repoStore.closeMerge()}>Close</Button>
          </Stack>
        {/snippet}
      </EmptyState>
    {:else if doc && fileLevelReason}
      <EmptyState icon="alert" title={fileLevelReason}>
        {#snippet action()}
          <Stack gap="lg" align="center">
            <Stack direction="row" gap="md" justify="center" wrap>
              <Button onclick={() => acceptSide("ours")}>
                {doc?.kind === "deletedByUs" ? "Keep Deleted" : "Accept Yours"}
                <Text tone="dim">{doc?.oursLabel}</Text>
              </Button>
              <Button onclick={() => acceptSide("theirs")}>
                {doc?.kind === "deletedByThem" ? "Keep Deleted" : "Accept Theirs"}
                <Text tone="dim">{doc?.theirsLabel}</Text>
              </Button>
              {#if !doc?.binary}
                <Button onclick={() => (forceText = true)}>Merge Text Anyway</Button>
              {/if}
            </Stack>
            <Button onclick={() => repoStore.closeMerge()}>Cancel</Button>
          </Stack>
        {/snippet}
      </EmptyState>
    {:else if doc}
      {#key version}
        <MergeEditor
          bind:this={editor}
          {doc}
          onApply={applyResult}
          onCancel={() => repoStore.closeMerge()}
          onReload={reload}
        />
      {/key}
    {:else}
      <EmptyState titleTone="dim" title="Loading..." delayed />
    {/if}
  </Stack>
</WindowLayer>
