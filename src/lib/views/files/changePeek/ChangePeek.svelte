<!-- The change peek's content (peekField.ts puts it under the change): the file's diff against the index in the
     library's PeekPanel, in the Diff layout from Settings, scrolled to the change, with Stage, Revert, the next and
     previous change and Close in its header, and a Revert button on every change of the diff. The diff editors are
     the diff view's own (DiffEditors). -->
<script lang="ts">
  import DiffFrame from "@nibtree/ui/components/DiffFrame.svelte";
  import type { DiffFrameParts } from "@nibtree/ui/components/DiffFrame.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import PeekPanel from "@nibtree/ui/components/PeekPanel.svelte";
  import { DiffEditors } from "$lib/diff/diffEditors.svelte";
  import { diffPrefs } from "$lib/diff/prefs.svelte";
  import { clampDiffSplit } from "$lib/diff/split";
  import { settings } from "$lib/stores/settings.svelte";
  import type { Eol, LineSelection } from "$lib/types";
  import { type PeekKind, peekCounter } from "./peekModel";

  interface Props {
    /** Repo-relative, for the language and the name in the header. */
    path: string;
    base: string;
    text: string;
    eol: Eol;
    hunks: [number, number, number, number][];
    index: number;
    kind: PeekKind;
    /** The editor's text can change: Stage and Revert are offered. */
    editable: boolean;
    onstage: () => void;
    onrevert: () => void;
    /** A change's own Revert button in the diff, with the lines it covers. */
    onrevertchange: (selection: LineSelection) => void;
    onstep: (direction: 1 | -1) => void;
    onclose: () => void;
  }

  let {
    path,
    base,
    text,
    eol,
    hunks,
    index,
    kind,
    editable,
    onstage,
    onrevert,
    onrevertchange,
    onstep,
    onclose,
  }: Props = $props();

  const hunk = $derived(hunks[index]);
  /** Each build scrolls to the change again, also after a layout switch. */
  let revealToken = 0;
  const editors = new DiffEditors(() => ({ line: hunk ? hunk[2] : 0, token: revealToken }));
  let parts = $state<DiffFrameParts | null>(null);
  const inline = $derived(settings.diffLayout === "inline");
  const fileName = $derived(path.split("/").pop() ?? path);

  $effect(() => {
    const target = parts;
    if (!target) {
      return;
    }
    const layout = settings.diffLayout;
    const collapse = diffPrefs.collapseUnchanged;
    const scrollKey = `peek:${layout}:${collapse}:${path}:${index}`;
    revealToken++;
    const diff = {
      path,
      original: base,
      modified: text,
      originalEol: eol,
      modifiedEol: eol,
      binary: false,
      tooLarge: false,
      hunks,
    };
    // Side by side and aligned, each change's Revert button sits beside the working tree's numbers.
    const bands = editable
      ? {
          side: "right" as const,
          actions: {
            revert: (change: number) => {
              const selection = editors.changeLines(change);
              if (selection) {
                onrevertchange(selection);
              }
            },
            toward: "left" as const,
            revertTitle: "Revert this change",
          },
        }
      : null;
    void editors.build({
      parts: target,
      diff,
      path,
      mode: "readonly",
      collapse,
      layout,
      scrollKey,
      blame: null,
      onRevert: editable ? onrevertchange : null,
      bands,
    });
    return () => editors.teardown(scrollKey);
  });
</script>

<PeekPanel
  label="Change in {fileName}"
  title={fileName}
  detail="Working tree changes, {peekCounter(index, hunks.length)}"
  tone={kind}
  {onclose}
>
  {#snippet actions()}
    {#if editable}
      <IconButton icon="plus" label="Stage this change" size="compact" onclick={onstage} />
      <IconButton icon="discard" label="Revert this change" size="compact" onclick={onrevert} />
    {/if}
    <IconButton icon="arrow-down" label="Next change" size="compact" onclick={() => onstep(1)} />
    <IconButton icon="arrow-up" label="Previous change" size="compact" onclick={() => onstep(-1)} />
    <IconButton icon="x" label="Close" size="compact" onclick={onclose} />
  {/snippet}
  <DiffFrame
    layout={inline ? "inline" : "split"}
    label="Diff of {fileName} against the index"
    sideLabels={{ original: "Index", modified: "Working Tree" }}
    ribbons={inline ? null : editors.ribbons}
    colors="oldToNew"
    ruler
    bind:ratio={() => clampDiffSplit(settings.diffSplitRatio), (ratio) => (settings.diffSplitRatio = ratio)}
    oncommitratio={() => settings.save()}
    onready={(ready) => {
      parts = ready;
      return () => (parts = null);
    }}
  />
</PeekPanel>
