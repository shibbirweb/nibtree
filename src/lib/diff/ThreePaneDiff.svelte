<!-- A file in three read-only panes: a merge commit's parent 1, merge result and parent 2, or the
     staging view's HEAD, index and work tree, with bands joining each side's changes to the middle. With `onapply`
     the bands carry arrows that take a change into the middle (stage or unstage); with `workingFile`, Open File
     opens the real file; with `blame`, Blame shows who wrote each line of one pane. The panes' widths are saved.
     threeWayEditors.svelte.ts builds the editors, and the toolbar is the same DiffToolbar as every other diff. -->
<script lang="ts">
  import MergeFrame from "@nibtree/ui/components/MergeFrame.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import { setBlameDisplay } from "$lib/editor/blame";
  import { type DiffLayout, settings } from "$lib/stores/settings.svelte";
  import type { FileDiff, LineSelection } from "$lib/types";
  import DiffToolbar from "./DiffToolbar.svelte";
  import { openWorkingFile } from "./openWorkingFile";
  import { diffPrefs } from "./prefs.svelte";
  import type { ParentSide, ThreeWayOptions } from "./threeWay";
  import type { ThreeWayBlame } from "./threeWayBlame";
  import { ThreeWayEditors } from "./threeWayEditors.svelte";
  import type { PaneActions } from "./threeWayGutters";
  import type { ChunkActions } from "@nibtree/ui/editor/mergeGutters";

  interface Props {
    /** The left pane (original) against the middle (modified). */
    left: FileDiff;
    /** The right pane (original) against the middle (modified). */
    right: FileDiff;
    path: string;
    labels: { left: string; result: string; right: string };
    /** What the three panes show, for screen readers. */
    label: string;
    options?: ThreeWayOptions;
    /** The middle text with one side's change taken into it (the band's arrow). */
    onapply?: ((middle: string, side: ParentSide) => void) | null;
    applyTitles?: { left: string; right: string } | null;
    /** Side by side or Inline in the layout buttons: back to the two-pane diff. */
    onlayout: (layout: DiffLayout) => void;
    /** The file in the work tree (absolute path), for Open File; `sameLines` when the right pane is the work tree. */
    workingFile?: { filePath: string; sameLines: boolean } | null;
    /** Who wrote each line of one pane: the work tree in the staging view, the merge result for a merge commit. */
    blame?: ThreeWayBlame | null;
    /**
     * Revert and Apply on one side's bands instead of `onapply`: a commit's change (its side pane old, the middle
     * new) taken out of or into the work tree, called with the change's lines.
     */
    lineActions?: {
      side: ParentSide;
      onrevert: (selection: LineSelection) => void;
      onapply: (selection: LineSelection) => void;
    } | null;
  }

  let {
    left,
    right,
    path,
    labels,
    label,
    options = {},
    onapply = null,
    applyTitles = null,
    onlayout,
    workingFile = null,
    blame = null,
    lineActions = null,
  }: Props = $props();

  const APPLY_TO_WORK_TREE = "Apply this change to the working tree";
  const editors = new ThreeWayEditors();
  /** The middle pane's place when new texts rebuild the panes (after staging a change). */
  let keptScroll: number | null = null;

  // The Blame button and the current line blame setting reach the open panes as they change.
  $effect(() => {
    const display = { inline: settings.currentLineBlame, gutter: settings.blameGutter };
    const view = blame ? editors.blameView : null;
    if (view) {
      setBlameDisplay(view, display);
    }
  });

  /** Opens the real file in an editor tab, at the right pane's line when that pane is the work tree. */
  function openFile(): void {
    if (workingFile) {
      void openWorkingFile(workingFile.filePath, workingFile.sameLines ? editors.lineOnScreen("right") : null);
    }
  }

  function apply(index: number, side: ParentSide): void {
    const change = editors.change(side, index);
    if (!change) {
      return;
    }
    if (lineActions) {
      lineActions.onapply(change.lines);
    } else {
      onapply?.(change.taken, side);
    }
  }

  function revert(index: number, side: ParentSide): void {
    const change = editors.change(side, index);
    if (change) {
      lineActions?.onrevert(change.lines);
    }
  }

  /** Each side's change buttons, in its gutter beside the line numbers. */
  const actions = $derived.by((): PaneActions => {
    const forSide = (side: ParentSide): ChunkActions => ({
      apply: (index) => apply(index, side),
      revert: lineActions ? (index) => revert(index, side) : undefined,
      toward: side === "left" ? "right" : "left",
      applyTitle: () => (lineActions ? APPLY_TO_WORK_TREE : (applyTitles?.[side] ?? `Apply ${side} change`)),
      revertTitle: "Revert this change in the working tree",
    });
    if (lineActions) {
      return { [lineActions.side]: forSide(lineActions.side) };
    }
    return onapply ? { left: forSide("left"), right: forSide("right") } : {};
  });
</script>

<Stack grow gap="none">
  <DiffToolbar
    changeCount={editors.changeCount}
    current={editors.current}
    summary={editors.summary}
    ongo={(direction) => editors.goToChange(direction)}
    textDiff
    layout="three"
    threePanes="Three panes: {labels.left}, {labels.result} and {labels.right}"
    onlayout={(layout) => layout !== "three" && onlayout(layout)}
    collapseTitle="Collapse the lines that match on every side"
    showBlame={blame !== null}
    showOpenFile={workingFile !== null}
    onopenfile={openFile}
    {path}
  />
  {#key diffPrefs.collapseUnchanged}
    {#key left}
      {#key right}
        <MergeFrame
          {label}
          {labels}
          leftRibbons={editors.leftRibbons}
          rightRibbons={editors.rightRibbons}
          colors={{ left: "oldToNew", right: options.rightNewer ? "oldToNew" : "newToOld" }}
          bind:split={() => settings.threePaneSplit, (split) => (settings.threePaneSplit = split)}
          oncommitsplit={() => settings.save()}
          onready={(parts) => {
            const collapse = diffPrefs.collapseUnchanged;
            void editors.build({ parts, left, right, path, collapse, options, scrollTop: keptScroll, blame, actions });
            return () => {
              keptScroll = editors.scrollTop();
              editors.destroy();
            };
          }}
        />
      {/key}
    {/key}
  {/key}
</Stack>
