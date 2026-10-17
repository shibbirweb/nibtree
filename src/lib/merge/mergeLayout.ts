// The merge tool's two layouts. Columns: yours, the result and theirs side by side, joined by ribbons, each side's
// buttons beside its line numbers. Stacked: yours and theirs on top, the result below, with a lens of links above
// each change instead of ribbons and buttons. The editors are the same in both; only these per-pane extensions are
// swapped, through one compartment, so a switch keeps the text, the undo history and every applied change.
import { Compartment, type EditorState, type Extension } from "@codemirror/state";
import { type EditorView, lineNumbers } from "@codemirror/view";
import type { MergeFrameParts } from "@nibtree/ui/components/MergeFrame.svelte";
import { chunkLenses, type LensItem } from "@nibtree/ui/editor/chunkLens";
import { noVerticalScrollbar } from "@nibtree/ui/editor/mergeGutterTheme";
import { gutterChunkField } from "@nibtree/ui/editor/mergeGutters";
import { type MarkSource, scrollMarkers } from "$lib/editor/scrollMarkers";
import type { MergeLayout } from "$lib/stores/settingsData";
import { type ChunkActionTarget, chunkField, sideGutters } from "./extensions";
import type { Pane } from "./mergeScroll";
import { type ChunkState, isResolved, type SideName } from "./model";

export const layoutCompartment = new Compartment();

/** What a lens's links call: the merge session. */
export interface LensTarget extends ChunkActionTarget {
  acceptBoth(chunkId: number): void;
}

/** A side's lenses: Accept and Ignore for each open change, Accept both for a conflict. */
function sideLenses(state: EditorState, side: SideName, target: LensTarget): LensItem[] {
  return state.field(gutterChunkField).map((chunk) => ({
    line: chunk.start,
    kind: chunk.kind,
    actions: [
      { label: "Accept", title: "Take this change into the result", run: () => target.apply(chunk.index, side) },
      ...(chunk.kind === "conflict"
        ? [{ label: "Accept both", title: "Take both sides, yours first", run: () => target.acceptBoth(chunk.index) }]
        : []),
      { label: "Ignore", title: "Keep the result as it is", run: () => target.ignore(chunk.index, side) },
    ],
  }));
}

/** The result's lenses: what each open conflict has taken so far. */
export function resultLenses(chunks: readonly ChunkState[]): LensItem[] {
  return chunks
    .filter((chunk) => chunk.kind === "conflict" && !isResolved(chunk))
    .map((chunk) => ({
      line: chunk.result.start,
      kind: "conflict",
      note: chunk.oursDone ? "Left side taken" : chunk.theirsDone ? "Right side taken" : "No changes accepted",
      actions: [],
    }));
}

/** One pane's layout extensions. */
export function paneLayout(pane: Pane, layout: MergeLayout, target: LensTarget, resultMarks: MarkSource): Extension {
  if (layout === "columns") {
    return pane === "result" ? [scrollMarkers(resultMarks, "onText"), noVerticalScrollbar] : sideGutters(pane, target);
  }
  if (pane === "result") {
    return [scrollMarkers(resultMarks, "end"), chunkLenses((state) => resultLenses(state.field(chunkField)))];
  }
  // Yours has no scrollbar of its own between the two top panes; theirs keeps it.
  return [
    lineNumbers(),
    gutterChunkField,
    scrollMarkers(undefined, "end"),
    pane === "ours" ? noVerticalScrollbar : [],
    chunkLenses((state) => sideLenses(state, pane, target)),
  ];
}

/** Moves the open editors into another layout's panes and swaps their layout extensions. */
export function moveToLayout(
  views: Record<Pane, EditorView>,
  parts: MergeFrameParts,
  layout: MergeLayout,
  target: LensTarget,
  resultMarks: MarkSource,
): void {
  const hosts: Record<Pane, HTMLElement> = { ours: parts.left, result: parts.result, theirs: parts.right };
  for (const pane of ["ours", "result", "theirs"] as const) {
    hosts[pane].append(views[pane].dom);
    views[pane].dispatch({
      effects: layoutCompartment.reconfigure(paneLayout(pane, layout, target, resultMarks)),
    });
    views[pane].requestMeasure();
  }
}
