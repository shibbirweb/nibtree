// The gutters and look of an aligned side by side diff (VS Code style): CodeMirror's MergeView with its padding, so
// both sides scroll as one and every change lines up row for row. Each side has its numbers on the left, a minus or
// plus beside every changed line, and a hatched filler where only the other side has lines.
import { type EditorState, type Extension, type RangeSet, RangeSetBuilder, StateField } from "@codemirror/state";
import { EditorView, GutterMarker, gutter, lineNumbers } from "@codemirror/view";
import { getChunks } from "@codemirror/merge";
import { type ChunkActions, chunkActionGutter, type GutterChunk } from "./mergeGutters";
import { mergeGutterTheme, toneGutterColors } from "./mergeGutterTheme";
import { type SplitSide, splitChunks, splitGutterColors } from "./splitGutters";

/** The 0-based lines that get a sign on one side: every line its changes have there, top down. */
export function signLines(chunks: readonly GutterChunk[]): number[] {
  const lines: number[] = [];
  for (const chunk of chunks) {
    for (let line = chunk.start; line < chunk.end; line++) {
      lines.push(line);
    }
  }
  return lines.sort((left, right) => left - right);
}

class SignMarker extends GutterMarker {
  constructor(readonly sign: string) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof SignMarker && other.sign === this.sign;
  }

  toDOM(): Node {
    return document.createTextNode(this.sign);
  }
}

function signSet(state: EditorState, side: SplitSide, marker: SignMarker): RangeSet<GutterMarker> {
  const builder = new RangeSetBuilder<GutterMarker>();
  const { doc } = state;
  for (const line of signLines(splitChunks(state, side))) {
    if (line < doc.lines) {
      const from = doc.line(line + 1).from;
      builder.add(from, from, marker);
    }
  }
  return builder.finish();
}

/** A minus beside each removed or changed line of the old side, a plus beside each line of the new side. */
function signGutter(side: SplitSide): Extension {
  const marker = new SignMarker(side === "a" ? "−" : "+");
  const field = StateField.define<RangeSet<GutterMarker>>({
    create: (state) => signSet(state, side, marker),
    update(value, transaction) {
      const changed = getChunks(transaction.state)?.chunks !== getChunks(transaction.startState)?.chunks;
      return changed || transaction.docChanged ? signSet(transaction.state, side, marker) : value;
    },
  });
  return [
    field,
    gutter({ class: "cm-diffSigns", markers: (view) => view.state.field(field), initialSpacer: () => marker }),
  ];
}

/** The hatched filler of the rows a side lacks, and the signs' look. */
export const alignedDiffTheme = EditorView.theme({
  ".cm-mergeSpacer": {
    backgroundImage:
      "repeating-linear-gradient(-45deg, var(--border-strong) 0 var(--diff-frame-filler-stripe), " +
      "transparent var(--diff-frame-filler-stripe) var(--diff-frame-filler-gap))",
  },
  // The filler already shows where the other side's lines are, so the numbers draw no gap line.
  "&.cm-editor .cm-gutters .cm-mc-gap-before, &.cm-editor .cm-gutters .cm-mc-gap-after": { boxShadow: "none" },
  ".cm-diffSigns .cm-gutterElement": { width: "var(--diff-frame-sign-width)", textAlign: "center" },
  "&.cm-merge-a .cm-diffSigns .cm-gutterElement": { color: "var(--danger)" },
  "&.cm-merge-b .cm-diffSigns .cm-gutterElement": { color: "var(--diff-added-edge)" },
});

/**
 * One side of an aligned diff: its numbers on the left, then `actions` (the change's stage, unstage, apply or revert
 * buttons) and the signs, each change red or green through them. Both sides look the same; the frame scrolls them.
 */
export function alignedPaneGutters(side: SplitSide, actions: ChunkActions | null): Extension {
  const buttons = actions ? chunkActionGutter("before", actions, (state) => splitChunks(state, side)) : [];
  return [
    splitGutterColors(side),
    lineNumbers(),
    buttons,
    signGutter(side),
    mergeGutterTheme,
    toneGutterColors(false),
    alignedDiffTheme,
  ];
}
