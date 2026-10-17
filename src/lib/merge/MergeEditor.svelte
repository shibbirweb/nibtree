<!-- The 3-way merge tool: a toolbar, the frame of the chosen layout (Columns: the library's MergeFrame; Stacked:
     MergeStackFrame, loaded only when picked) filled with the editors of mergeSession.svelte.ts, and a footer with
     Accept Left, Accept Right, Cancel and Apply. Switching the layout moves the same editors into the other frame. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import MergeFrame from "@nibtree/ui/components/MergeFrame.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import ToggleButton from "@nibtree/ui/components/ToggleButton.svelte";
  import Toolbar from "@nibtree/ui/components/Toolbar.svelte";
  import { onDestroy, untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { editorLanguage } from "$lib/editor/setup";
  import { settings } from "$lib/stores/settings.svelte";
  import type { MergeLayout } from "$lib/stores/settingsData";
  import type { MergeDocument } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { confirmDiscard, confirmReload, confirmSave, statusText } from "./mergeConfirm";
  import { MergeSession } from "./mergeSession.svelte";
  import { isResolved, type SideName, unresolvedCounts } from "./model";

  interface Props {
    doc: MergeDocument;
    /** Saves the result; resolves when done. */
    onApply: (content: string) => Promise<void> | void;
    onCancel: () => void;
    /** Reloads the document with a different whitespace mode. */
    onReload: (ignoreWhitespace: boolean) => void;
  }

  let { doc, onApply, onCancel, onReload }: Props = $props();

  let saving = $state(false);
  const session = new MergeSession(
    untrack(() => doc),
    () => {
      if (!dialogs.active) {
        void save();
      }
    },
  );

  const counts = $derived(unresolvedCounts(session.chunks));
  const nonConflicting = $derived(
    session.chunks.filter((chunk) => !isResolved(chunk) && chunk.kind !== "conflict" && !chunk.edited).length,
  );
  const fileName = $derived(doc.path.split("/").pop() ?? doc.path);
  const statusTone = $derived(counts.changes === 0 ? "success" : counts.conflicts > 0 ? "danger" : "dim");

  /** The setting is the layout of every merge; the toolbar's switch changes it too, like Ignore whitespace. */
  const layout = $derived(settings.mergeLayout);

  function setLayout(next: MergeLayout): void {
    settings.mergeLayout = next;
    settings.save();
  }

  /**
   * A frame's panes are in the page. The first frame gets new editors once the file's language is loaded; a frame
   * shown after a layout switch gets the same editors moved in, so nothing in them changes.
   */
  function attach(parts: Parameters<MergeSession["build"]>[0]): () => void {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    const shown = untrack(() => layout);
    const ready = () => {
      observer = new ResizeObserver(() => session.scheduleDraw());
      observer.observe(parts.panes);
    };
    if (session.views) {
      session.relayout(parts, shown);
      ready();
    } else {
      void editorLanguage(doc.path).then((language) => {
        if (!cancelled) {
          session.build(parts, language, shown);
          ready();
        }
      });
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }

  onDestroy(() => session.destroy());

  async function acceptWhole(side: SideName): Promise<void> {
    if (session.views) {
      session.acceptWhole(side);
      await save(true);
    }
  }

  async function save(skipChecks = false): Promise<void> {
    const content = session.resultText();
    if (content === null || saving) {
      return;
    }
    if (!skipChecks && !(await confirmSave(unresolvedCounts(session.currentChunks()), content))) {
      return;
    }
    saving = true;
    try {
      await onApply(content);
    } finally {
      saving = false;
    }
  }

  /** Cancel, Esc and the close button all end here, so an edited result is never dropped without asking. */
  export async function cancel(): Promise<void> {
    if (saving) {
      return;
    }
    if (session.edited() && !(await confirmDiscard())) {
      return;
    }
    onCancel();
  }

  async function toggleWhitespace(): Promise<void> {
    if (session.edited() && !(await confirmReload())) {
      return;
    }
    onReload(!doc.ignoreWhitespace);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (dialogs.active || event.defaultPrevented) {
      return;
    }
    if (event.key === "F7") {
      event.preventDefault();
      session.navigate(event.shiftKey ? -1 : 1);
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      // The editors handle Cmd+Enter themselves; this covers the toolbar and buttons.
      event.preventDefault();
      void save();
    } else if (event.key === "Escape" && !(event.target as HTMLElement | null)?.closest(".cm-panels")) {
      event.preventDefault();
      void cancel();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<Stack gap="none" grow surface="panel">
  <Toolbar variant="merge" label="Merge">
    <Stack direction="row" gap="xxs" label="Apply">
      <IconButton
        icon="chevrons-right"
        iconSize="regular"
        label="Apply non-conflicting changes from the left"
        onclick={() => session.applyNonConflicting("ours")}
        disabled={nonConflicting === 0}
      />
      <IconButton
        icon="wand"
        iconSize="regular"
        label="Apply all non-conflicting changes"
        onclick={() => session.applyNonConflicting()}
        disabled={nonConflicting === 0}
      >
        <Text size="codeSmall">Apply non-conflicting</Text>
      </IconButton>
      <IconButton
        icon="chevrons-left"
        iconSize="regular"
        label="Apply non-conflicting changes from the right"
        onclick={() => session.applyNonConflicting("theirs")}
        disabled={nonConflicting === 0}
      />
    </Stack>
    <Divider direction="vertical" />
    <Stack direction="row" gap="xxs" label="Changes">
      <IconButton
        icon="arrow-up"
        iconSize="regular"
        label="Previous change"
        title="Previous change ({localKeys('Shift+F7')})"
        onclick={() => session.navigate(-1)}
        disabled={counts.changes === 0}
      />
      <IconButton
        icon="arrow-down"
        iconSize="regular"
        label="Next change"
        title="Next change ({localKeys('F7')})"
        onclick={() => session.navigate(1)}
        disabled={counts.changes === 0}
      />
    </Stack>
    <Divider direction="vertical" />
    <Stack direction="row" gap="xxs" label="History">
      <IconButton
        icon="undo"
        iconSize="regular"
        label="Undo"
        title="Undo ({localKeys('CmdOrCtrl+Z')} in the result)"
        onclick={() => session.undo()}
        disabled={!session.canUndo}
      />
      <IconButton
        icon="redo"
        iconSize="regular"
        label="Redo"
        title="Redo ({localKeys('CmdOrCtrl+Shift+Z')} in the result)"
        onclick={() => session.redo()}
        disabled={!session.canRedo}
      />
    </Stack>
    <Divider direction="vertical" />
    <ToggleButton
      variant="outline"
      icon="pilcrow"
      text="Ignore whitespace"
      label="Ignore whitespace"
      title="Ignore whitespace differences when comparing"
      bind:pressed={() => doc.ignoreWhitespace, () => void toggleWhitespace()}
    />
    <Divider direction="vertical" />
    <Stack direction="row" gap="none" role="group" label="Merge layout">
      <ToggleButton
        icon="split-three"
        label="Columns"
        title="Columns: yours, the result and theirs side by side"
        bind:pressed={() => layout === "columns", (on) => on && setLayout("columns")}
      />
      <ToggleButton
        icon="split-stacked"
        label="Stacked"
        title="Stacked: yours and theirs on top, the result below"
        bind:pressed={() => layout === "stacked", (on) => on && setLayout("stacked")}
      />
    </Stack>
    {#snippet end()}
      <Text weight="medium" tone={statusTone}>{statusText(counts)}</Text>
    {/snippet}
  </Toolbar>

  {#if layout === "columns"}
    <MergeFrame
      label="Merge {fileName}"
      labels={{ left: doc.oursLabel, result: "Result", right: doc.theirsLabel }}
      {fileName}
      leftRibbons={session.leftRibbons}
      rightRibbons={session.rightRibbons}
      bind:split={() => settings.threePaneSplit, (split) => (settings.threePaneSplit = split)}
      oncommitsplit={() => settings.save()}
      onready={attach}
    />
  {:else}
    {#await import("@nibtree/ui/components/MergeStackFrame.svelte") then stacked}
      <stacked.default
        label="Merge {fileName}"
        labels={{ left: doc.oursLabel, result: "Result", right: doc.theirsLabel }}
        {fileName}
        bind:topHeight={() => settings.mergeStackHeight, (height) => (settings.mergeStackHeight = height)}
        bind:ratio={() => settings.mergeStackRatio, (ratio) => (settings.mergeStackRatio = ratio)}
        oncommit={() => settings.save()}
        onready={attach}
      >
        {#snippet resultEnd()}
          <Text size="small" tone={statusTone}>{statusText(counts)}</Text>
        {/snippet}
      </stacked.default>
    {/await}
  {/if}

  <Toolbar variant="footer" label="Merge actions">
    <Button onclick={() => acceptWhole("ours")} disabled={saving} title="Resolve the whole file with the left version">
      Accept Left
    </Button>
    <Button
      onclick={() => acceptWhole("theirs")}
      disabled={saving}
      title="Resolve the whole file with the right version"
    >
      Accept Right
    </Button>
    {#snippet end()}
      <Text size="small" tone="dim">
        {localKeys("F7")} next change &middot; {localKeys("CmdOrCtrl+Enter")} apply
      </Text>
      <Button onclick={() => void cancel()} disabled={saving}>Cancel</Button>
      <Button variant="primary" onclick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Apply"}</Button>
    {/snippet}
  </Toolbar>
</Stack>
