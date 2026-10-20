// Lines and selections of the diff editors, for both layouts: the inline layout's text holds removed and added
// lines, so its lines map to the new text through the InlineDoc.
import type { Chunk, MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import type { ChangeMark } from "$lib/editor/lineDiff";
import type { LineHunk, LineSelection } from "$lib/types";
import { diffMarks } from "./diffViews";
import { docLineOf, inlineChangeMarks, type InlineDoc, inlineSelection, newLineAt } from "./inlineDoc";
import { type DiffSide, rangeLines, selectedChangeLines } from "./lineSelection";

/** Puts the cursor on the new text's `line` (0-based) and scrolls it to the middle. */
export function revealNewLine(editor: EditorView, line: number, inlineDoc: InlineDoc | null): void {
  const doc = editor.state.doc;
  const shown = inlineDoc ? docLineOf(inlineDoc, line) : line;
  const position = doc.line(Math.max(1, Math.min(shown + 1, doc.lines))).from;
  editor.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
}

/** Puts the cursor on change `index` (on both sides, side by side) and scrolls it to the middle. */
export function revealChange(
  editor: EditorView | null,
  view: MergeView | null,
  inlineDoc: InlineDoc | null,
  index: number,
): void {
  let position: number | null = null;
  if (view) {
    const chunk = view.chunks[index];
    if (chunk) {
      view.a.dispatch({ selection: { anchor: Math.min(chunk.fromA, view.a.state.doc.length) } });
      position = Math.min(chunk.fromB, view.b.state.doc.length);
    }
  } else if (editor && inlineDoc?.blocks[index]) {
    const doc = editor.state.doc;
    position = doc.line(Math.min(inlineDoc.blocks[index].from + 1, doc.lines)).from;
  }
  if (!editor || position === null) {
    return;
  }
  editor.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
}

/**
 * The new text's line to open the file at: the cursor line when it is on screen, else the top line of `scroller`
 * (the editor's own, or the aligned diff's that scrolls both sides).
 */
export function newLineOnScreen(
  editor: EditorView,
  inlineDoc: InlineDoc | null,
  scroller: HTMLElement = editor.scrollDOM,
): number {
  const head = editor.state.selection.main.head;
  let line: number;
  if (editor.hasFocus || editor.visibleRanges.some((range) => head >= range.from && head <= range.to)) {
    line = editor.state.doc.lineAt(head).number - 1;
  } else {
    const top = Math.max(0, scroller.getBoundingClientRect().top - editor.documentTop);
    line = editor.state.doc.lineAt(editor.lineBlockAtHeight(top).from).number - 1;
  }
  return inlineDoc ? newLineAt(inlineDoc, line) : line;
}

/** The changed lines `editor`'s selection picks on `side`; none without hunks that fit the texts. */
export function selectedLines(
  editor: EditorView | null,
  hunks: LineHunk[] | null,
  side: DiffSide,
  inlineDoc: InlineDoc | null,
): LineSelection {
  if (!editor || !hunks) {
    return { oldLines: [], newLines: [] };
  }
  const { doc, selection } = editor.state;
  const spans = selection.ranges.map((range) => rangeLines(doc, range.from, range.to));
  // Inline, removed and added lines are both in the text: a selection picks exactly its lines.
  return inlineDoc ? inlineSelection(inlineDoc, spans) : selectedChangeLines(hunks, side, spans);
}

/** The overview ruler's marks: the split diff's chunks, or the inline layout's blocks. */
export function rulerMarks(
  editor: EditorView,
  chunks: readonly Chunk[] | null,
  inlineDoc: InlineDoc | null,
): ChangeMark[] {
  if (chunks) {
    return diffMarks(editor, chunks);
  }
  return inlineDoc ? inlineChangeMarks(inlineDoc) : [];
}
