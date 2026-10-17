// CodeMirror extensions for the 2-way diff: app-token styling for
// @codemirror/merge and per-chunk line classes (added / deleted / modified), and the two-pane red and green.

import { getChunks } from "@codemirror/merge";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { svgIcon } from "@nibtree/ui/editor/svgIcon";
import type { IconName } from "@nibtree/ui/icons";
import { scales } from "@nibtree/ui/tokens";

// The diff looks come from the library; they are re-exported here for the diff modules.
export { sideColors, toneColors } from "@nibtree/ui/editor/diffColors";
export { diffTheme } from "@nibtree/ui/editor/theme";

const addedLine = Decoration.line({ class: "cm-diffAdded" });
const deletedLine = Decoration.line({ class: "cm-diffDeleted" });

/** Marks lines of pure insertions (b side) and pure deletions (a side). */
function buildKindDecorations(view: EditorView): DecorationSet {
  const info = getChunks(view.state);
  if (!info || !info.side) {
    return Decoration.none;
  }
  const isA = info.side === "a";
  const doc = view.state.doc;
  const { from: viewFrom, to: viewTo } = view.viewport;
  const builder = new RangeSetBuilder<Decoration>();
  for (const chunk of info.chunks) {
    const from = isA ? chunk.fromA : chunk.fromB;
    const to = isA ? chunk.toA : chunk.toB;
    const otherEmpty = isA ? chunk.fromB === chunk.toB : chunk.fromA === chunk.toA;
    if (from >= viewTo) {
      break;
    }
    if (from === to || !otherEmpty || to <= viewFrom) {
      continue;
    }
    const decoration = isA ? deletedLine : addedLine;
    let pos = from;
    while (pos < to && pos <= doc.length) {
      const line = doc.lineAt(pos);
      builder.add(line.from, line.from, decoration);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const chunkKinds = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildKindDecorations(view);
    }

    update(update: ViewUpdate): void {
      const chunksChanged = getChunks(update.startState)?.chunks !== getChunks(update.state)?.chunks;
      if (update.docChanged || update.viewportChanged || chunksChanged) {
        this.decorations = buildKindDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Builds a small icon button for the merge view's revert column. */
export function revertButton(title: string, iconName: IconName): HTMLElement {
  const button = document.createElement("button");
  button.className = "diff-revert";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.appendChild(svgIcon(iconName, scales.iconSize.medium));
  return button;
}
