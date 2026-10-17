// The merge panes' change rulers: line marks as ruler ticks, and the result's ruler read from its chunk field.
import type { ChangeMark } from "$lib/editor/lineDiff";
import type { MarkSource } from "$lib/editor/scrollMarkers";
import { chunkField, type LineMark, resultMarks } from "./extensions";
import type { ChunkState } from "./model";

export function toChangeMarks(marks: LineMark[]): ChangeMark[] {
  return marks.map((mark) => ({ from: mark.range.start, to: mark.range.end, kind: mark.type }));
}

/** The result's ruler: follows the chunk field, memoized so scrolling does no work. */
export function resultMarkSource(): MarkSource {
  let memo: { chunks: ChunkState[]; marks: ChangeMark[] } | null = null;
  return (state) => {
    const current = state.field(chunkField);
    if (!memo || memo.chunks !== current) {
      memo = { chunks: current, marks: toChangeMarks(resultMarks(current)) };
    }
    return memo.marks;
  };
}
