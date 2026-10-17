// Folded runs of unchanged lines for both diff layouts (the rules live in foldModel.ts). A fold
// opens 10 lines at a time from either edge, or fully from its label. In the side by side diff
// both editors fold the same runs and every step is sent to the other side too, so they stay
// lined up.

import { type Chunk, getChunks, mergeViewSiblings } from "@codemirror/merge";
import { type EditorState, type Extension, Facet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { FoldRowWidget, type FoldRowHandlers, foldRowTheme } from "@nibtree/ui/editor/foldRow";
import { type FoldEdge, type FoldRange, FOLD_STEP, foldEdges, foldRanges, revealFold } from "./foldModel";
import { scopeLabelAt } from "./foldScope";

/** Every fold field of an editor, so the folds on screen can be read (tests). */
const foldFields = Facet.define<StateField<DecorationSet>>();

/** The folded line ranges of an editor, top down. */
export function foldedLines(state: EditorState): FoldRange[] {
  const ranges: FoldRange[] = [];
  for (const field of state.facet(foldFields)) {
    state.field(field).between(0, state.doc.length, (from, to) => {
      ranges.push({ first: state.doc.lineAt(from).number, last: state.doc.lineAt(to).number });
    });
  }
  return ranges;
}

/** Opens the fold around `pos`, a step at one edge or fully (the 3-pane diff mirrors it to its other panes). */
export const foldStep = StateEffect.define<{ pos: number; edge: FoldEdge }>({
  map: (value, change) => ({ pos: change.mapPos(value.pos), edge: value.edge }),
});

/** The same position in the other side's text (positions between changes shift by a fixed offset). */
function mapPos(pos: number, chunks: readonly Chunk[], isA: boolean): number {
  let startOur = 0;
  let startOther = 0;
  for (const chunk of chunks) {
    if ((isA ? chunk.fromA : chunk.fromB) >= pos) {
      break;
    }
    [startOur, startOther] = isA ? [chunk.toA, chunk.toB] : [chunk.toB, chunk.toA];
  }
  return startOther + (pos - startOur);
}

/** Sends a step to this editor and, in the side by side diff, to the other side. */
function stepFold(view: EditorView, pos: number, edge: FoldEdge): void {
  const siblings = mergeViewSiblings(view);
  const chunks = getChunks(view.state)?.chunks ?? [];
  view.dispatch({ effects: foldStep.of({ pos, edge }) });
  if (siblings) {
    const isA = siblings.a === view;
    (isA ? siblings.b : siblings.a).dispatch({ effects: foldStep.of({ pos: mapPos(pos, chunks, isA), edge }) });
  }
}

/** The fold row's labels and clicks: the scope it hides, and steps sent to this editor and its sibling. */
const foldRowHandlers: FoldRowHandlers = {
  label: (view, labelLine) => scopeLabelAt(view.state, labelLine),
  open: (view, row, edge) => stepFold(view, view.posAtDOM(row), edge),
};

function foldDecoration(state: EditorState, range: FoldRange) {
  const edges = foldEdges(range, state.doc.lines);
  const labelLine = Math.min(range.last + 1, state.doc.lines);
  return Decoration.replace({
    widget: new FoldRowWidget(
      range.last - range.first + 1,
      edges.top,
      edges.bottom,
      labelLine,
      FOLD_STEP,
      foldRowHandlers,
    ),
    block: true,
  }).range(state.doc.line(range.first).from, state.doc.line(range.last).to);
}

function applyStep(folds: DecorationSet, state: EditorState, pos: number, edge: FoldEdge): DecorationSet {
  let found = null as { from: number; to: number } | null;
  folds.between(pos, pos, (from, to) => {
    found = { from, to };
    return false;
  });
  if (!found) {
    return folds;
  }
  const { from, to } = found;
  const left = revealFold({ first: state.doc.lineAt(from).number, last: state.doc.lineAt(to).number }, edge);
  return folds.update({
    filter: (start) => start !== from,
    add: left ? [foldDecoration(state, left)] : [],
  });
}

/**
 * Folds as block widgets (a StateField, since block decorations cannot come from a plugin). A
 * fold also opens when the cursor lands in it, so a Find match or a reveal is never hidden, and
 * when a change grows into it.
 */
function foldField(initial: (state: EditorState) => readonly FoldRange[]): StateField<DecorationSet> {
  const build = (state: EditorState) =>
    Decoration.set(
      initial(state)
        .filter((range) => range.last <= state.doc.lines)
        .map((range) => foldDecoration(state, range)),
    );
  return StateField.define<DecorationSet>({
    create: build,
    update(value, tr) {
      // MergeView adds its chunks only after both editors' states exist (StateEffect.appendConfig), so the side by
      // side folds are made when the chunks arrive, not when the field is created.
      if (!getChunks(tr.startState) && getChunks(tr.state)) {
        return build(tr.state);
      }
      let next = value.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(foldStep)) {
          next = applyStep(next, tr.state, effect.value.pos, effect.value.edge);
        }
      }
      if (tr.selection) {
        const head = tr.selection.main.head;
        next = next.update({ filter: (from, to) => head < from || head > to });
      }
      const info = getChunks(tr.state);
      if (next.size && info && info.chunks !== getChunks(tr.startState)?.chunks) {
        const isA = info.side === "a";
        const touched: number[] = [];
        for (const chunk of info.chunks) {
          next.between(isA ? chunk.fromA : chunk.fromB, isA ? chunk.toA : chunk.toB, (from) => {
            touched.push(from);
          });
        }
        if (touched.length) {
          next = next.update({ filter: (from) => !touched.includes(from) });
        }
      }
      return next;
    },
    provide: (field) => [EditorView.decorations.from(field), foldFields.of(field)],
  });
}

/** Folds for one side of the side by side diff, from the merge view's chunks. */
export function splitFolds(): Extension {
  const field = foldField((state) => {
    const info = getChunks(state);
    if (!info) {
      return [];
    }
    const isA = info.side === "a";
    const doc = state.doc;
    const changes = info.chunks.map((chunk) => ({
      first: doc.lineAt(isA ? chunk.fromA : chunk.fromB).number,
      after: doc.lineAt(Math.min(doc.length, isA ? chunk.toA : chunk.toB)).number,
    }));
    return foldRanges(changes, doc.lines);
  });
  // A fold opened by the cursor opens on the other side too. Deferred, since an update
  // listener must not dispatch while the update runs.
  const follow = EditorView.updateListener.of((update) => {
    if (!update.selectionSet || update.transactions.some((tr) => tr.effects.some((effect) => effect.is(foldStep)))) {
      return;
    }
    const head = update.state.selection.main.head;
    const opened: number[] = [];
    update.startState
      .field(field)
      .map(update.changes)
      .between(head, head, (from, to) => {
        if (head >= from && head <= to) {
          opened.push(from);
        }
      });
    const siblings = mergeViewSiblings(update.view);
    if (!opened.length || !siblings) {
      return;
    }
    const isA = siblings.a === update.view;
    const other = isA ? siblings.b : siblings.a;
    const chunks = getChunks(update.state)?.chunks ?? [];
    queueMicrotask(() => {
      if (!other.dom.isConnected) {
        return;
      }
      other.dispatch({ effects: opened.map((from) => foldStep.of({ pos: mapPos(from, chunks, isA), edge: "all" })) });
    });
  });
  return [field, follow, foldRowTheme];
}

/** Folds for the inline diff, from its runs of unchanged lines. */
export function inlineFolds(ranges: readonly FoldRange[]): Extension {
  return [foldField(() => ranges), foldRowTheme];
}
