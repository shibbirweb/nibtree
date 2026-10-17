// The 3-pane diff's gutters, drawn like the merge tool's: each side's line numbers face the middle with its change
// buttons beside them, the change colors run through the numbers, and only the right pane keeps a vertical
// scrollbar (the panes scroll together). The middle has its numbers on the left and its ruler over its lines' ends.
import type { Extension } from "@codemirror/state";
import { lineNumbers } from "@codemirror/view";
import { noVerticalScrollbar, toneGutterColors } from "@nibtree/ui/editor/mergeGutterTheme";
import { type ChunkActions, paneGutters, setGutterChunks } from "@nibtree/ui/editor/mergeGutters";
import { scrollMarkers, setChangeMarks } from "$lib/editor/scrollMarkers";
import { gutterChunks, type LineMark, setSideMarks } from "$lib/merge/extensions";
import { type ParentSide, rulerMarks } from "./threeWay";

type Pane = ParentSide | "result";

/** The buttons each side's changes get, keyed by side; a side left out shows its numbers alone. */
export type PaneActions = Partial<Record<ParentSide, ChunkActions>>;

export function paneChrome(name: Pane, actions: PaneActions): Extension {
  if (name === "result") {
    return [lineNumbers(), scrollMarkers(undefined, "onText"), noVerticalScrollbar, toneGutterColors(true)];
  }
  const left = name === "left";
  return [
    paneGutters(left ? "after" : "before", actions[name] ?? null, false),
    scrollMarkers(undefined, left ? "start" : "end"),
    left ? noVerticalScrollbar : [],
    toneGutterColors(true),
  ];
}

/** A pane's marks: its tints, its ruler and, on a side, its gutter buttons (indexed like `ThreeWayEditors.change`). */
export function markEffects(name: Pane, marks: LineMark[]) {
  const effects = [setSideMarks.of(marks), setChangeMarks.of(rulerMarks(marks))];
  return name === "result" ? effects : [...effects, setGutterChunks.of(gutterChunks(marks))];
}
