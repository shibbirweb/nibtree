// Draws spaces as dots and tabs as arrows. Only the
// visible lines are decorated, and with "none" the extension adds nothing to the editor.

import { Compartment, Facet, type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { RenderWhitespace } from "$lib/stores/settingsData";
import { whitespaceTheme } from "@nibtree/ui/editor/guideThemes";

/** A stretch of spaces, or one tab, as offsets into a line. */
export interface WhitespaceRun {
  from: number;
  to: number;
  tab: boolean;
}

/** The runs of `text` drawn by `mode`; "selection" uses the same runs as "all", clipped later. */
export function whitespaceRuns(text: string, mode: RenderWhitespace): WhitespaceRun[] {
  if (mode === "none") {
    return [];
  }
  let trailingStart = text.length;
  while (trailingStart > 0 && isBlank(text[trailingStart - 1])) {
    trailingStart--;
  }
  const runs: WhitespaceRun[] = [];
  let index = mode === "trailing" ? trailingStart : 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\t") {
      runs.push({ from: index, to: index + 1, tab: true });
      index++;
      continue;
    }
    if (char !== " ") {
      index++;
      continue;
    }
    const from = index;
    while (index < text.length && text[index] === " ") {
      index++;
    }
    const singleBetweenWords =
      index - from === 1 && from > 0 && index < text.length && !isBlank(text[from - 1]) && !isBlank(text[index]);
    if (mode === "boundary" && singleBetweenWords) {
      continue;
    }
    runs.push({ from, to: index, tab: false });
  }
  return runs;
}

/** Clips line-relative runs to the selected document ranges, keeping document order. */
export function clipRuns(
  runs: WhitespaceRun[],
  lineFrom: number,
  selections: readonly { from: number; to: number }[],
): { from: number; to: number; tab: boolean }[] {
  const clipped: { from: number; to: number; tab: boolean }[] = [];
  for (const run of runs) {
    for (const range of selections) {
      const from = Math.max(lineFrom + run.from, range.from);
      const to = Math.min(lineFrom + run.to, range.to);
      if (from < to) {
        clipped.push({ from, to, tab: run.tab });
      }
    }
  }
  return clipped;
}

function isBlank(char: string): boolean {
  return char === " " || char === "\t";
}

const spaceMark = Decoration.mark({ class: "cm-ws-space" });
const tabMark = Decoration.mark({ class: "cm-ws-tab" });

const modeFacet = Facet.define<RenderWhitespace, RenderWhitespace>({
  combine: (values) => values[0] ?? "none",
});

function build(view: EditorView): DecorationSet {
  const mode = view.state.facet(modeFacet);
  const builder = new RangeSetBuilder<Decoration>();
  const selections = view.state.selection.ranges.filter((range) => !range.empty);
  if (mode === "none" || (mode === "selection" && selections.length === 0)) {
    return builder.finish();
  }
  const doc = view.state.doc;
  let lastLine = -1;
  for (const visible of view.visibleRanges) {
    let position = visible.from;
    while (position <= visible.to) {
      const line = doc.lineAt(position);
      // Visible ranges can share a line; decorate it once.
      if (line.number > lastLine) {
        lastLine = line.number;
        const runs = whitespaceRuns(line.text, mode);
        const ranges =
          mode === "selection"
            ? clipRuns(runs, line.from, selections)
            : runs.map((run) => ({ from: line.from + run.from, to: line.from + run.to, tab: run.tab }));
        for (const range of ranges) {
          builder.add(range.from, range.to, range.tab ? tabMark : spaceMark);
        }
      }
      position = line.to + 1;
    }
  }
  return builder.finish();
}

const renderer = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = build(view);
    }

    update(update: ViewUpdate): void {
      const selectionMode = update.state.facet(modeFacet) === "selection";
      if (update.docChanged || update.viewportChanged || (selectionMode && update.selectionSet)) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const compartment = new Compartment();
const views = new Set<EditorView>();

/** Remembers each editor so a changed setting reaches the ones already open. */
const registry = ViewPlugin.define((view) => {
  views.add(view);
  return {
    destroy() {
      views.delete(view);
    },
  };
});

function modeExtension(mode: RenderWhitespace): Extension {
  return mode === "none" ? [] : [modeFacet.of(mode), renderer, whitespaceTheme];
}

/** Whitespace rendering for an editor, starting with the current setting. */
export function renderWhitespace(mode: RenderWhitespace): Extension {
  return [registry, compartment.of(modeExtension(mode))];
}

/** Applies a changed setting to every open editor. */
export function setRenderWhitespace(mode: RenderWhitespace): void {
  const effects = compartment.reconfigure(modeExtension(mode));
  for (const view of views) {
    view.dispatch({ effects });
  }
}
