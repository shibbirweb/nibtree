// CodeMirror glue for the 3-way merge: the chunk state lives in a StateField
// of the result editor so it undoes/redoes together with the text.

import { invertedEffects } from "@codemirror/commands";
import { Prec, StateEffect, StateField, type Extension, type Range, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, gutterLineClass, keymap } from "@codemirror/view";
import { chunkGutterClasses, type GutterChunk, paneGutters, setGutterChunks } from "@nibtree/ui/editor/mergeGutters";
import { mergeGutterTheme, noVerticalScrollbar } from "@nibtree/ui/editor/mergeGutterTheme";
import { mergeTheme } from "@nibtree/ui/editor/theme";
import type { LineRange } from "$lib/types";
import { scrollMarkers } from "$lib/editor/scrollMarkers";
import type { TextSpan } from "./inline";
import {
  changeType,
  type ChangeType,
  type ChunkState,
  isResolved,
  mapChunks,
  resultChangeType,
  sideChanged,
  type SideName,
  sideRange,
} from "./model";

export const setChunks = StateEffect.define<ChunkState[]>();

export const chunkField = StateField.define<ChunkState[]>({
  create: () => [],
  update(value, tr) {
    // Several effects can arrive in one undo group; the last is the oldest state.
    let explicit: ChunkState[] | null = null;
    for (const effect of tr.effects) {
      if (effect.is(setChunks)) {
        explicit = effect.value;
      }
    }
    if (explicit) {
      return explicit;
    }
    if (tr.docChanged) {
      return mapChunks(value, tr.changes, tr.startState.doc);
    }
    return value;
  },
});

/** Records the previous chunk state for every change so undo restores it exactly. */
const chunkHistory = invertedEffects.of((tr) => {
  const before = tr.startState.field(chunkField, false);
  const after = tr.state.field(chunkField, false);
  if (!before || before === after) {
    return [];
  }
  return [setChunks.of(before)];
});

export interface LineMark {
  range: LineRange;
  type: ChangeType;
  /** Word-level changes, as offsets from the start of the range's first line. */
  inline?: TextSpan[] | null;
  /** The older or newer side of its change, for the 3-pane diff's red and green; the merge tool leaves it out. */
  tone?: "old" | "new" | null;
  /** The merge chunk it shows, for its buttons in the gutter. */
  chunkId?: number;
}

const inlineMarks = {
  none: Decoration.mark({ class: "cm-mc-inline" }),
  old: Decoration.mark({ class: "cm-mc-inline cm-mc-inline-old" }),
  new: Decoration.mark({ class: "cm-mc-inline cm-mc-inline-new" }),
};

function lineDecorations(doc: Text, marks: LineMark[]): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const lineCount = doc.lines;
  for (const mark of marks) {
    const { start, end } = mark.range;
    const tone = mark.tone ? ` cm-mc-${mark.tone}` : "";
    if (start < end) {
      const last = Math.min(end, lineCount) - 1;
      for (let index = start; index <= last; index++) {
        const edge =
          start === last ? "cm-mc-single" : index === start ? "cm-mc-first" : index === last ? "cm-mc-last" : "";
        const line = doc.line(index + 1);
        decorations.push(Decoration.line({ class: `cm-mc-line cm-mc-${mark.type}${tone} ${edge}` }).range(line.from));
      }
      if (mark.inline && mark.inline.length > 0) {
        const blockFrom = doc.line(start + 1).from;
        const blockTo = doc.line(last + 1).to;
        for (const span of mark.inline) {
          const from = blockFrom + span.from;
          const to = Math.min(blockFrom + span.to, blockTo);
          if (from < to) {
            decorations.push(inlineMarks[mark.tone ?? "none"].range(from, to));
          }
        }
      }
    } else if (start < lineCount) {
      const line = doc.line(start + 1);
      decorations.push(Decoration.line({ class: `cm-mc-gap-before cm-mc-edge-${mark.type}${tone}` }).range(line.from));
    } else {
      const line = doc.line(lineCount);
      decorations.push(Decoration.line({ class: `cm-mc-gap-after cm-mc-edge-${mark.type}${tone}` }).range(line.from));
    }
  }
  return Decoration.set(decorations, true);
}

export function resultMarks(chunks: ChunkState[]): LineMark[] {
  return chunks
    .filter((chunk) => !isResolved(chunk))
    .map((chunk) => ({ range: chunk.result, type: resultChangeType(chunk) }));
}

export function sideMarks(
  chunks: ChunkState[],
  side: SideName,
  inlineFor?: (chunk: ChunkState) => TextSpan[] | null,
): LineMark[] {
  return chunks
    .filter((chunk) => sideChanged(chunk, side) && !(side === "ours" ? chunk.oursDone : chunk.theirsDone))
    .map((chunk) => ({
      range: sideRange(chunk, side),
      type: changeType(chunk, side),
      inline: inlineFor?.(chunk) ?? null,
      chunkId: chunk.id,
    }));
}

const resultDecorations = EditorView.decorations.compute([chunkField, "doc"], (state) =>
  lineDecorations(state.doc, resultMarks(state.field(chunkField))),
);

/** The marks as gutter rows, so a change's color runs through the line numbers too; `index` is the chunk's id. */
export function gutterChunks(marks: LineMark[]): GutterChunk[] {
  return marks.map((mark, index) => ({
    index: mark.chunkId ?? index,
    kind: mark.type,
    start: mark.range.start,
    end: mark.range.end,
    tone: mark.tone ?? null,
  }));
}

const resultGutters = gutterLineClass.compute([chunkField, "doc"], (state) =>
  chunkGutterClasses(state.doc, gutterChunks(resultMarks(state.field(chunkField)))),
);

export const setSideMarks = StateEffect.define<LineMark[]>();

const sideMarkField = StateField.define<{ lines: DecorationSet; gutters: ReturnType<typeof chunkGutterClasses> }>({
  create: (state) => ({ lines: Decoration.none, gutters: chunkGutterClasses(state.doc, []) }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSideMarks)) {
        return {
          lines: lineDecorations(tr.state.doc, effect.value),
          gutters: chunkGutterClasses(tr.state.doc, gutterChunks(effect.value)),
        };
      }
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.lines),
    gutterLineClass.from(field, (value) => value.gutters),
  ],
});

export function resultExtensions(initial: ChunkState[]): Extension[] {
  return [chunkField.init(() => initial), chunkHistory, resultDecorations, resultGutters, mergeTheme, mergeGutterTheme];
}

export function sideExtensions(): Extension[] {
  return [sideMarkField, mergeTheme, mergeGutterTheme];
}

/** What a side's chunk buttons call: the merge session. */
export interface ChunkActionTarget {
  apply(chunkId: number, side: SideName): void;
  ignore(chunkId: number, side: SideName): void;
}

/**
 * A merge side's gutters: its line numbers next to the result (ours has them on its right) and its chunks' Apply and
 * Ignore buttons beside them, never over a number; ours keeps its ruler at its outer edge and no vertical scrollbar,
 * so a band runs unbroken into the connector. The rows take their color from `sideExtensions`.
 */
export function sideGutters(side: SideName, target: ChunkActionTarget): Extension[] {
  const name = side === "ours" ? "left" : "right";
  const gutters = paneGutters(
    side === "ours" ? "after" : "before",
    {
      apply: (chunkId) => target.apply(chunkId, side),
      ignore: (chunkId) => target.ignore(chunkId, side),
      toward: side === "ours" ? "right" : "left",
      applyTitle: () => `Apply ${name} change`,
      ignoreTitle: `Ignore ${name} change`,
    },
    false,
  );
  return side === "ours"
    ? [gutters, scrollMarkers(undefined, "start"), noVerticalScrollbar]
    : [gutters, scrollMarkers(undefined, "end")];
}

/** The side marks and their gutter buttons for a side editor. */
export function sideMarkEffects(marks: LineMark[]) {
  return [setSideMarks.of(marks), setGutterChunks.of(gutterChunks(marks))];
}

/**
 * Cmd+Enter applies the merge from any pane. It must outrank the default keymap, where
 * Mod-Enter inserts a blank line in the editable result.
 */
export function applyKeymap(onApply: () => void): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        scope: "editor search-panel",
        preventDefault: true,
        run: () => {
          onApply();
          return true;
        },
      },
    ]),
  );
}
