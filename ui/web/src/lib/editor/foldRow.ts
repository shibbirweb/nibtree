// A folded run of unchanged lines in a diff, drawn as one row: its "10 more" buttons first, always shown, so they sit
// at the left in every layout; then the name of the code it hides over a wavy line. A click on the row opens it all.
// The app owns the folds (which lines, how they open); this draws one and reports the clicks.
import { EditorView, WidgetType } from "@codemirror/view";
import { scales } from "../styles/tokens";
import { svgIcon } from "./svgIcon";

export type FoldRowEdge = "top" | "bottom" | "all";

export interface FoldRowHandlers {
  /** The name of the code the row hides, read at `labelLine`, or null to show the count. */
  label(view: EditorView, labelLine: number): string | null;
  /** Opens `step` lines at one end of the fold the row is in, or all of it. */
  open(view: EditorView, row: HTMLElement, edge: FoldRowEdge): void;
}

function stepButton(
  view: EditorView,
  row: HTMLElement,
  edge: "top" | "bottom",
  step: number,
  handlers: FoldRowHandlers,
) {
  const button = document.createElement("button");
  const title = `Show ${step} more lines from the ${edge} of the fold`;
  button.className = "cm-diffFoldStep";
  button.title = title;
  button.setAttribute("aria-label", title);
  // The arrow points the way the lines open: down from the code above, up from the code below.
  button.append(svgIcon(edge === "top" ? "chevron-down" : "chevron-up", scales.iconSize.compact));
  button.append(document.createTextNode(`${step} more from the ${edge}`));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.open(view, row, edge);
  });
  return button;
}

export class FoldRowWidget extends WidgetType {
  constructor(
    readonly count: number,
    readonly top: boolean,
    readonly bottom: boolean,
    readonly labelLine: number,
    readonly step: number,
    readonly handlers: FoldRowHandlers,
  ) {
    super();
  }

  eq(other: FoldRowWidget): boolean {
    return (
      other.count === this.count &&
      other.top === this.top &&
      other.bottom === this.bottom &&
      other.labelLine === this.labelLine &&
      other.step === this.step
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const row = document.createElement("div");
    row.className = "cm-diffFold";
    row.title = `${this.count} unchanged lines, click to show them`;
    if (this.top) {
      row.append(stepButton(view, row, "top", this.step, this.handlers));
    }
    if (this.bottom) {
      row.append(stepButton(view, row, "bottom", this.step, this.handlers));
    }
    const label = document.createElement("span");
    label.className = "cm-diffFoldLabel";
    label.textContent = this.handlers.label(view, this.labelLine) ?? `${this.count} unchanged lines`;
    const wave = document.createElement("span");
    wave.className = "cm-diffFoldWave";
    row.append(label, wave);
    row.addEventListener("click", () => this.handlers.open(view, row, "all"));
    return row;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** One period of a fold's wavy line, used as a mask so the line takes a theme color. */
const WAVE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="6">' +
  '<path d="M0 3 Q3 0 6 3 T12 3" fill="none" stroke="#000" stroke-width="1.2"/></svg>';

/** The fold row's look: the code's scope in small dim text over a wavy line, no box. */
export const foldRowTheme = EditorView.theme({
  "&.cm-editor .cm-content .cm-diffFold": {
    display: "flex",
    alignItems: "center",
    gap: "var(--diff-fold-gap)",
    padding:
      "var(--diff-fold-padding-y) var(--diff-fold-padding-right) var(--diff-fold-padding-y) " +
      "var(--diff-fold-padding-left)",
    color: "var(--text-dim)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--diff-fold-font-size)",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  "&.cm-editor .cm-content .cm-diffFoldLabel": {
    flex: "0 1 auto",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "var(--diff-fold-label-padding-y) var(--diff-fold-label-padding-x)",
    border: "1px solid var(--border)",
    borderRadius: "var(--diff-fold-label-radius)",
    background: "var(--editor-bg)",
  },
  "&.cm-editor .cm-content .cm-diffFoldWave": {
    flex: "1",
    minWidth: "var(--diff-fold-wave-min-width)",
    height: "var(--diff-fold-wave-height)",
    background: "var(--border-strong)",
    mask:
      `url("data:image/svg+xml,${encodeURIComponent(WAVE)}") repeat-x left center / ` +
      "var(--diff-fold-wave-tile) var(--diff-fold-wave-height)",
  },
  "&.cm-editor .cm-content .cm-diffFold:hover .cm-diffFoldLabel": {
    color: "var(--text)",
    borderColor: "var(--border-strong)",
  },
  "&.cm-editor .cm-content .cm-diffFold:hover .cm-diffFoldWave": {
    background: "var(--accent)",
  },
  "&.cm-editor .cm-content .cm-diffFoldStep": {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--diff-fold-step-gap)",
    padding: "var(--diff-fold-step-padding-y) var(--diff-fold-step-padding-x)",
    border: "none",
    borderRadius: "var(--diff-fold-step-radius)",
    background: "transparent",
    color: "var(--accent)",
    font: "inherit",
    cursor: "pointer",
  },
  "&.cm-editor .cm-content .cm-diffFoldStep:hover": {
    background: "var(--hover)",
    color: "var(--accent-hover)",
  },
  "&.cm-editor .cm-content .cm-diffFoldStep svg": {
    pointerEvents: "none",
  },
});
