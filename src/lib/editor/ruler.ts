// The right margin line: one
// thin line at a column, drawn as a single marker in a CodeMirror layer above the text.
// It covers only the lines CodeMirror has drawn: a line as tall as a long document is a surface the browser tiles
// and keeps in memory while scrolling. With the setting off, the extension is not in the editor at all.

import type { Extension } from "@codemirror/state";
import { EditorView, layer, RectangleMarker, type ViewUpdate } from "@codemirror/view";
import { textOrigin } from "./layerGeometry";
import { rulerTheme } from "@nibtree/ui/editor/guideThemes";

/** Left edge of `column`, in pixels from the start of the line's text. */
export function rulerOffset(column: number, characterWidth: number): number {
  return Math.max(0, column) * characterWidth;
}

/** Top and height of the margin line: the drawn lines, and at least the visible area (a short file). */
export function rulerSpan(
  drawnTop: number,
  drawnBottom: number,
  visibleTop: number,
  visibleHeight: number,
): { top: number; height: number } {
  const top = Math.min(drawnTop, visibleTop);
  const bottom = Math.max(drawnBottom, visibleTop + visibleHeight);
  return { top, height: Math.max(0, bottom - top) };
}

function markers(view: EditorView, column: number): readonly RectangleMarker[] {
  const origin = textOrigin(view);
  const left = origin.left + rulerOffset(column, view.defaultCharacterWidth);
  const blocks = view.viewportLineBlocks;
  const span = rulerSpan(
    origin.top + (blocks[0]?.top ?? 0),
    origin.top + (blocks.at(-1)?.bottom ?? 0),
    view.scrollDOM.scrollTop,
    view.scrollDOM.clientHeight,
  );
  return [new RectangleMarker("cm-gm-ruler", left, span.top, null, span.height)];
}

/** A margin line at `column` for an editor. */
export function rulerLine(column: number): Extension {
  return [
    layer({
      above: true,
      class: "cm-gm-rulerLayer",
      markers: (view) => markers(view, column),
      update: (update: ViewUpdate) => update.geometryChanged || update.viewportChanged,
    }),
    rulerTheme,
  ];
}
