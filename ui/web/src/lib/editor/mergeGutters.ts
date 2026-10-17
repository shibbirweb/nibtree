// A merge pane's gutters: numbers on the side facing the next pane, chunk colors on every gutter row (a band runs
// from the text through the numbers into the connector), and chunk buttons beside the numbers, never over them.
import {
  type EditorState,
  type Extension,
  type RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import { GutterMarker, gutter, gutterLineClass, lineNumbers } from "@codemirror/view";
import type { IconName } from "../icons";
import { svgIcon } from "./svgIcon";

export type GutterSide = "before" | "after";

/** A chunk in one pane: lines [start, end), 0-based; an empty range marks the gap before line `start`. */
export interface GutterChunk {
  index: number;
  kind: "modified" | "added" | "deleted" | "conflict";
  start: number;
  end: number;
  /** The older or newer side of a diff, for red and green instead of the kind's color. */
  tone?: "old" | "new" | null;
}

export interface ChunkActions {
  /** Takes the chunk's change into the result. */
  apply?: (index: number) => void;
  ignore?: (index: number) => void;
  /** Takes the chunk's change back out of its own pane's file (a commit's change in the working tree). */
  revert?: (index: number) => void;
  /** Where the result is: the arrows point to it. */
  toward: "right" | "left";
  applyTitle?: (index: number) => string;
  ignoreTitle?: string;
  revertTitle?: string;
}

class ClassMarker extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof ClassMarker && other.elementClass === this.elementClass;
  }
}

const classMarkers = new Map<string, ClassMarker>();

function classMarker(name: string): ClassMarker {
  let marker = classMarkers.get(name);
  if (!marker) {
    marker = new ClassMarker(name);
    classMarkers.set(name, marker);
  }
  return marker;
}

function edgeClass(start: number, end: number, line: number): string {
  if (end - start === 1) {
    return " cm-mc-single";
  }
  if (line === start) {
    return " cm-mc-first";
  }
  return line === end - 1 ? " cm-mc-last" : "";
}

/** The gutter classes of every chunk line, so each gutter's row takes its chunk's color and edges. */
export function chunkGutterClasses(doc: Text, chunks: GutterChunk[]): RangeSet<GutterMarker> {
  const builder = new RangeSetBuilder<GutterMarker>();
  const sorted = [...chunks].sort((left, right) => left.start - right.start);
  for (const chunk of sorted) {
    const tone = chunk.tone ? ` cm-mc-${chunk.tone}` : "";
    if (chunk.start >= chunk.end) {
      const gapLine = Math.min(chunk.start, doc.lines - 1);
      const where = chunk.start < doc.lines ? "before" : "after";
      builder.add(
        doc.line(gapLine + 1).from,
        doc.line(gapLine + 1).from,
        classMarker(`cm-mc-gap-${where} cm-mc-edge-${chunk.kind}${tone}`),
      );
      continue;
    }
    for (let line = chunk.start; line < chunk.end && line < doc.lines; line++) {
      const from = doc.line(line + 1).from;
      builder.add(
        from,
        from,
        classMarker(`cm-mc-gutter cm-mc-${chunk.kind}${tone}${edgeClass(chunk.start, chunk.end, line)}`),
      );
    }
  }
  return builder.finish();
}

class ActionsMarker extends GutterMarker {
  constructor(
    readonly chunk: GutterChunk,
    readonly actions: ChunkActions,
  ) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return (
      other instanceof ActionsMarker &&
      other.chunk.index === this.chunk.index &&
      other.chunk.kind === this.chunk.kind &&
      other.actions === this.actions
    );
  }

  toDOM(): HTMLElement {
    const { chunk, actions } = this;
    const box = document.createElement("div");
    box.className = "cm-mc-buttons";
    const button = (
      kind: "apply" | "ignore" | "revert",
      icon: IconName,
      title: string,
      run: (index: number) => void,
    ) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `cm-mc-btn cm-mc-btn-${kind}${kind === "apply" ? ` cm-mc-${chunk.kind}` : ""}`;
      element.title = title;
      element.setAttribute("aria-label", title);
      element.append(svgIcon(icon));
      // Keeps the editor's selection and focus where they are.
      element.addEventListener("mousedown", (event) => event.preventDefault());
      element.addEventListener("click", () => run(chunk.index));
      return element;
    };
    const apply = actions.apply
      ? button(
          "apply",
          actions.toward === "right" ? "chevrons-right" : "chevrons-left",
          actions.applyTitle?.(chunk.index) ?? "Apply this change",
          actions.apply,
        )
      : null;
    const ignore = actions.ignore
      ? button("ignore", "x", actions.ignoreTitle ?? "Ignore this change", actions.ignore)
      : null;
    const revert = actions.revert
      ? button("revert", "discard", actions.revertTitle ?? "Revert this change", actions.revert)
      : null;
    // The arrow sits next to the numbers, on the result's side, and Ignore next to the text.
    const order = actions.toward === "right" ? [ignore, revert, apply] : [apply, revert, ignore];
    box.append(...order.filter((element): element is HTMLButtonElement => element !== null));
    return box;
  }
}

/** The chunks a pane's buttons belong to, sent whenever they change. */
export const setGutterChunks = StateEffect.define<GutterChunk[]>();

/** The last chunks sent with `setGutterChunks`, for whatever else draws them (the stacked merge's lenses). */
export const gutterChunkField = StateField.define<GutterChunk[]>({
  create: () => [],
  update: (value, transaction) =>
    (transaction.effects.find((effect) => effect.is(setGutterChunks))?.value as GutterChunk[] | undefined) ?? value,
});

/** Line numbers on `side`: `after` puts them right of the text, facing a pane on the right. */
export function sideLineNumbers(side: GutterSide): Extension {
  if (side === "before") {
    return lineNumbers();
  }
  return gutter({
    class: "cm-lineNumbers",
    side: "after",
    lineMarker: (view, line) => new NumberMarker(view.state.doc.lineAt(line.from).number),
    lineMarkerChange: (update) => update.docChanged,
    initialSpacer: (view) => new NumberMarker(view.state.doc.lines),
    updateSpacer: (_spacer, update) => new NumberMarker(update.state.doc.lines),
  });
}

class NumberMarker extends GutterMarker {
  constructor(readonly lineNumber: number) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof NumberMarker && other.lineNumber === this.lineNumber;
  }

  toDOM(): Node {
    return document.createTextNode(String(this.lineNumber));
  }
}

const emptyActions = new (class extends GutterMarker {})();

/** A side pane's numbers on `side` and, with `actions`, its chunks' buttons beside them (chunks from
 *  `setGutterChunks`); `tint` colors the rows too, or the caller does. */
export function paneGutters(side: GutterSide, actions: ChunkActions | null, tint = true): Extension {
  const field = StateField.define<{ chunks: GutterChunk[]; classes: RangeSet<GutterMarker> }>({
    create: (state) => ({ chunks: [], classes: chunkGutterClasses(state.doc, []) }),
    update(value, transaction) {
      const next = transaction.effects.find((effect) => effect.is(setGutterChunks))?.value as GutterChunk[] | undefined;
      if (next || transaction.docChanged) {
        const chunks = next ?? value.chunks;
        return { chunks, classes: chunkGutterClasses(transaction.state.doc, chunks) };
      }
      return value;
    },
    provide: (field) => (tint ? gutterLineClass.from(field, (value) => value.classes) : []),
  });
  const actionGutter = actions ? chunkActionGutter(side, actions, (state) => state.field(field).chunks) : [];
  // An `after` gutter list is built outward from the text: the buttons first, then the numbers at the edge.
  return side === "after" ? [field, actionGutter, sideLineNumbers(side)] : [field, sideLineNumbers(side), actionGutter];
}

/** A column of chunk buttons on `side`: each chunk from `chunksOf` gets its Apply, Revert and Ignore. */
export function chunkActionGutter(
  side: GutterSide,
  actions: ChunkActions,
  chunksOf: (state: EditorState) => readonly GutterChunk[],
): Extension {
  return gutter({
    class: "cm-mc-actions",
    side,
    markers: (view) => {
      const builder = new RangeSetBuilder<GutterMarker>();
      const { doc } = view.state;
      for (const chunk of [...chunksOf(view.state)].sort((left, right) => left.start - right.start)) {
        const line = doc.line(Math.min(chunk.start, doc.lines - 1) + 1);
        builder.add(line.from, line.from, new ActionsMarker(chunk, actions));
      }
      return builder.finish();
    },
    initialSpacer: () => emptyActions,
  });
}
