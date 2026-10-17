// CodeMirror glue for the inline diff (the document and its logic live in inlineDoc.ts): each
// line colored by its own change (removed lines soft red, added lines green), changed words, the old and new number columns, a Stage or Unstage
// button per change (with Revert next to Stage), a - or + before each removed or added line, and
// folded runs of unchanged lines.

import { type EditorState, type Extension, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view";
import { inlineFolds } from "./foldField";
import { FOLD_MARGIN, FOLD_MIN_SIZE } from "./foldModel";
import { collapsedRuns, type InlineBlock, type InlineDoc, inlineWordMarks, lineSign } from "./inlineDoc";
import type { IconName } from "@nibtree/ui/icons";
import { inlineTheme } from "@nibtree/ui/editor/inlineDiffTheme";
import { revertButton } from "./mergeExtensions";

export interface InlineViewOptions {
  doc: InlineDoc;
  collapse: boolean;
  /** The button on each change: Stage (unstaged diff), Unstage (staged diff), Apply (a commit's), or none. */
  control: InlineControl | null;
  onControl: (block: InlineBlock) => void;
  /** The Revert button on each change: after Stage, or alone in a read-only diff (never in a staged one). */
  onRevert: ((block: InlineBlock) => void) | null;
}

export type InlineControl = "stage" | "unstage" | "apply";

/** A changed line's color: removed lines red and added lines green, also inside a modified change. */
type LineTint = "removed" | "added";

/** The color per document line, null for unchanged lines. */
function lineKinds(doc: InlineDoc): (LineTint | null)[] {
  return doc.lines.map((line) => {
    const sign = lineSign(line);
    return sign === "-" ? "removed" : sign === "+" ? "added" : null;
  });
}

const lineClass: Record<LineTint, Decoration> = {
  removed: Decoration.line({ class: "cm-inlineRemoved" }),
  added: Decoration.line({ class: "cm-inlineAdded" }),
};
const changedWord: Record<LineTint, Decoration> = {
  removed: Decoration.mark({ class: "cm-changedText cm-changedText-removed" }),
  added: Decoration.mark({ class: "cm-changedText cm-changedText-added" }),
};

function changeDecorations(state: EditorState, doc: InlineDoc, kinds: readonly (LineTint | null)[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  kinds.forEach((kind, index) => {
    if (kind && index < state.doc.lines) {
      ranges.push(lineClass[kind].range(state.doc.line(index + 1).from));
    }
  });
  for (const mark of inlineWordMarks(doc)) {
    const kind = mark.to <= state.doc.length ? kinds[state.doc.lineAt(mark.from).number - 1] : null;
    if (kind) {
      ranges.push(changedWord[kind].range(mark.from, mark.to));
    }
  }
  return Decoration.set(ranges, true);
}

class NumberMarker extends GutterMarker {
  constructor(
    readonly text: string,
    readonly kind: LineTint | null,
  ) {
    super();
    this.elementClass = kind ? `cm-inlineGutter-${kind}` : "";
  }

  eq(other: NumberMarker): boolean {
    return other.text === this.text && other.kind === this.kind;
  }

  toDOM(): Node {
    return document.createTextNode(this.text);
  }
}

function numberGutter(side: "old" | "new", doc: InlineDoc, kinds: readonly (LineTint | null)[]): Extension {
  let largest = 1;
  for (const line of doc.lines) {
    largest = Math.max(largest, (side === "old" ? (line.old ?? 0) : (line.new ?? 0)) + 1);
  }
  const widest = String(largest);
  return gutter({
    class: `cm-lineNumbers cm-inlineNumbers cm-inlineNumbers-${side}`,
    lineMarker: (view, line) => {
      const index = view.state.doc.lineAt(line.from).number - 1;
      const info = doc.lines[index];
      const number = side === "old" ? info?.old : info?.new;
      return new NumberMarker(number === null || number === undefined ? "" : String(number + 1), kinds[index] ?? null);
    },
    lineMarkerChange: () => false,
    initialSpacer: () => new NumberMarker(widest, null),
  });
}

class SignMarker extends GutterMarker {
  constructor(
    readonly sign: "-" | "+" | "",
    readonly kind: LineTint | null,
  ) {
    super();
    const signClass = this.sign === "-" ? " cm-inlineSign-removed" : this.sign === "+" ? " cm-inlineSign-added" : "";
    this.elementClass = kind ? `cm-inlineGutter-${kind}${signClass}` : "";
  }

  eq(other: SignMarker): boolean {
    return other.sign === this.sign && other.kind === this.kind;
  }

  toDOM(): Node {
    return document.createTextNode(this.sign);
  }
}

/**
 * The - and + column right before the text, like `git diff` prints them, so removed and added lines stay apart
 * where a modified change colors them alike. Its band continues the number columns' change colors.
 */
function signGutter(doc: InlineDoc, kinds: readonly (LineTint | null)[]): Extension {
  const markers = new Map<string, SignMarker>();
  const markerFor = (sign: "-" | "+" | "", kind: LineTint | null): SignMarker => {
    const key = `${sign}${kind ?? ""}`;
    let marker = markers.get(key);
    if (!marker) {
      marker = new SignMarker(sign, kind);
      markers.set(key, marker);
    }
    return marker;
  };
  return gutter({
    class: "cm-inlineSigns",
    lineMarker: (view, line) => {
      const index = view.state.doc.lineAt(line.from).number - 1;
      return markerFor(lineSign(doc.lines[index]), kinds[index] ?? null);
    },
    lineMarkerChange: () => false,
    initialSpacer: () => new SignMarker("+", null),
  });
}

/** A gutter button that runs on mousedown, like the side by side buttons, so the click never moves the cursor. */
function controlButton(title: string, iconName: IconName, run: () => void): HTMLElement {
  const button = revertButton(title, iconName);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    run();
  });
  return button;
}

const CONTROL_BUTTONS: Record<InlineControl, [string, IconName]> = {
  stage: ["Stage this change", "plus"],
  unstage: ["Unstage this change", "minus"],
  apply: ["Apply this change to the working tree", "chevrons-right"],
};

class ControlMarker extends GutterMarker {
  constructor(
    readonly block: InlineBlock,
    readonly control: InlineControl | null,
    readonly run: (block: InlineBlock) => void,
    readonly revert: ((block: InlineBlock) => void) | null,
  ) {
    super();
  }

  eq(other: ControlMarker): boolean {
    return other.block === this.block && other.control === this.control && other.revert === this.revert;
  }

  toDOM(): Node {
    const box = document.createElement("span");
    box.className = "diff-controls";
    if (this.control) {
      const [title, iconName] = CONTROL_BUTTONS[this.control];
      box.appendChild(controlButton(title, iconName, () => this.run(this.block)));
    }
    const revert = this.revert;
    if (revert) {
      const button = controlButton("Revert this change", "discard", () => revert(this.block));
      button.classList.add("diff-revert-change");
      box.appendChild(button);
    }
    return box;
  }
}

class SpacerMarker extends GutterMarker {
  constructor(readonly count: number) {
    super();
  }

  toDOM(): Node {
    const box = document.createElement("span");
    box.className = "diff-controls";
    for (let index = 0; index < this.count; index++) {
      const spacer = document.createElement("span");
      spacer.className = "diff-revert-spacer";
      box.appendChild(spacer);
    }
    return box;
  }
}

/** The buttons on each change's first line: Stage or Unstage, then Revert; a read-only diff may have Revert alone. */
function controlGutter(
  doc: InlineDoc,
  control: InlineControl | null,
  run: (block: InlineBlock) => void,
  revert: ((block: InlineBlock) => void) | null,
): Extension {
  const byLine = new Map(doc.blocks.map((block) => [block.from, new ControlMarker(block, control, run, revert)]));
  return gutter({
    class: "cm-inlineControls",
    lineMarker: (view, line) => byLine.get(view.state.doc.lineAt(line.from).number - 1) ?? null,
    lineMarkerChange: () => false,
    initialSpacer: () => new SpacerMarker((control ? 1 : 0) + (revert ? 1 : 0)),
  });
}

/** Everything the inline diff's editor needs on top of the read-only base. */
export function inlineDiffExtensions(options: InlineViewOptions): Extension[] {
  const { doc, collapse, control, onControl, onRevert } = options;
  const kinds = lineKinds(doc);
  const decorations = StateField.define<DecorationSet>({
    create: (state) => changeDecorations(state, doc, kinds),
    update: (value) => value,
    provide: (field) => EditorView.decorations.from(field),
  });
  return [
    inlineTheme,
    EditorView.editorAttributes.of({ class: "cm-inlineDiff" }),
    decorations,
    numberGutter("old", doc, kinds),
    numberGutter("new", doc, kinds),
    control || onRevert ? controlGutter(doc, control, onControl, control === "unstage" ? null : onRevert) : [],
    signGutter(doc, kinds),
    collapse
      ? inlineFolds(collapsedRuns(doc, FOLD_MARGIN, FOLD_MIN_SIZE).map(([from, to]) => ({ first: from + 1, last: to })))
      : [],
  ];
}
