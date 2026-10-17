// A row of small links above a merge chunk, for layouts without connectors (the stacked merge): its actions, such as
// "Accept | Accept both | Ignore", or a note such as "No changes accepted". Block widgets must come from a
// StateField, so the lenses are one, recomputed when the text or the chunks change.
import { type EditorState, type Extension, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

export interface LensAction {
  label: string;
  title?: string;
  run: () => void;
}

export interface LensItem {
  /** The chunk's first line, 0-based; the lens sits above it. */
  line: number;
  kind: "modified" | "added" | "deleted" | "conflict";
  note?: string;
  actions: LensAction[];
}

class LensWidget extends WidgetType {
  constructor(readonly item: LensItem) {
    super();
  }

  eq(other: LensWidget): boolean {
    const [a, b] = [this.item, other.item];
    return (
      a.kind === b.kind &&
      a.note === b.note &&
      a.actions.length === b.actions.length &&
      a.actions.every((action, index) => action.label === b.actions[index].label)
    );
  }

  toDOM(): HTMLElement {
    const row = document.createElement("div");
    row.className = `cm-mc-lens cm-mc-lens-${this.item.kind}`;
    const parts: HTMLElement[] = [];
    if (this.item.note) {
      const note = document.createElement("span");
      note.className = "cm-mc-lens-note";
      note.textContent = this.item.note;
      parts.push(note);
    }
    for (const action of this.item.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-mc-lens-action";
      button.textContent = action.label;
      button.title = action.title ?? action.label;
      // Keeps the editor's selection where it is.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => action.run());
      parts.push(button);
    }
    parts.forEach((part, index) => {
      if (index > 0) {
        const bar = document.createElement("span");
        bar.className = "cm-mc-lens-bar";
        bar.textContent = "|";
        row.append(bar);
      }
      row.append(part);
    });
    return row;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function lensDecorations(state: EditorState, items: readonly LensItem[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = state;
  for (const item of [...items].sort((left, right) => left.line - right.line)) {
    const from = doc.line(Math.min(item.line, doc.lines - 1) + 1).from;
    builder.add(from, from, Decoration.widget({ widget: new LensWidget(item), block: true, side: -1 }));
  }
  return builder.finish();
}

/** Lenses from `compute`, read again after every edit and every effect (a chunk applied, the chunks reset). */
export function chunkLenses(compute: (state: EditorState) => readonly LensItem[]): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => lensDecorations(state, compute(state)),
    update: (value, transaction) =>
      transaction.docChanged || transaction.effects.length > 0
        ? lensDecorations(transaction.state, compute(transaction.state))
        : value,
    provide: (self) => EditorView.decorations.from(self),
  });
  return [field, chunkLensTheme];
}

/** Small dim text in the UI font with link-like actions in the accent color, like a code lens. */
export const chunkLensTheme = EditorView.theme({
  ".cm-mc-lens": {
    display: "flex",
    alignItems: "center",
    gap: "var(--merge-lens-gap)",
    padding: "var(--merge-lens-padding-y) var(--merge-lens-padding-x)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-small)",
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
  },
  ".cm-mc-lens-bar": { color: "var(--text-faint)" },
  ".cm-mc-lens-action": {
    padding: "0",
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-mc-lens-action:hover": { color: "var(--accent-hover)", textDecoration: "underline" },
  ".cm-mc-lens-conflict .cm-mc-lens-note": { color: "var(--diff-conflict-edge)" },
});
