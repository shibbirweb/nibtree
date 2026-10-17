// Tints a merge pane's chunk lines (MergeView): a decoration set rebuilt when the chunks change, from the line
// ranges of the pane's side.
import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, gutterLineClass, type DecorationSet, type GutterMarker } from "@codemirror/view";
import type { RangeSet } from "@codemirror/state";
import { chunkLineClasses, type MergeChunk } from "../logic/mergeGeometry";
import { chunkGutterClasses, type GutterChunk } from "./mergeGutters";

export type ChunkSide = "left" | "result" | "right";

export const setChunks = StateEffect.define<MergeChunk[]>();

function decorations(view: { state: EditorView["state"] }, chunks: MergeChunk[], side: ChunkSide): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const lines = view.state.doc.lines;
  const ranges = chunks
    .map((chunk) => ({ kind: chunk.kind, range: chunk[side] }))
    .sort((left, right) => left.range[0] - right.range[0]);
  for (const { kind, range } of ranges) {
    for (let line = range[0]; line < range[1] && line < lines; line++) {
      const from = view.state.doc.line(line + 1).from;
      builder.add(from, from, Decoration.line({ class: chunkLineClasses(kind, range[0], range[1], line) }));
    }
  }
  return builder.finish();
}

/** A pane's chunks as gutter rows (`index` is the chunk's place in the list); empty ranges draw no rows. */
export function gutterChunksOf(chunks: MergeChunk[], side: ChunkSide): GutterChunk[] {
  return chunks
    .map((chunk, index) => ({ index, kind: chunk.kind, start: chunk[side][0], end: chunk[side][1] }))
    .filter((chunk) => chunk.end > chunk.start);
}

interface ChunkPaint {
  chunks: MergeChunk[];
  set: DecorationSet;
  gutters: RangeSet<GutterMarker>;
}

/** Tints the pane's chunk lines and their gutter rows, so the color runs through the line numbers. */
export function chunkDecorations(side: ChunkSide, initial: MergeChunk[]): Extension {
  const paint = (state: EditorView["state"], chunks: MergeChunk[]): ChunkPaint => ({
    chunks,
    set: decorations({ state }, chunks, side),
    gutters: chunkGutterClasses(state.doc, gutterChunksOf(chunks, side)),
  });
  return StateField.define<ChunkPaint>({
    create: (state) => paint(state, initial),
    update(value, transaction) {
      const next = transaction.effects.find((effect) => effect.is(setChunks))?.value as MergeChunk[] | undefined;
      if (next || transaction.docChanged) {
        return paint(transaction.state, next ?? value.chunks);
      }
      return value;
    },
    provide: (field) => [
      EditorView.decorations.from(field, (value) => value.set),
      gutterLineClass.from(field, (value) => value.gutters),
    ],
  });
}
