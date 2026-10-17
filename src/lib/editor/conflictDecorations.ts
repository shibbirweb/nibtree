// Inline conflict resolution for the file editor: colored sections and
// "Accept Current | Accept Incoming | Accept Both | Merge Tool" links above
// every conflict.

import { type Extension, type Range, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { componentTokens } from "@nibtree/ui/tokens";
import {
  type ConflictChoice,
  type ConflictRegion,
  findConflictsInDoc,
  resolveAllEdits,
  resolveEdit,
  updateConflicts,
} from "./conflictMarkers";
import { conflictTheme } from "@nibtree/ui/editor/conflictTheme";

export interface ConflictActions {
  onOpenMergeTool: () => void;
}

/** Kept as the same array while nothing changes, so the decorations and marks built from it are reused. */
export const conflictField = StateField.define<ConflictRegion[]>({
  create: (state) => findConflictsInDoc(state.doc),
  update: (value, tr) => (tr.docChanged ? updateConflicts(value, tr.changes, tr.startState.doc, tr.newDoc) : value),
});

export function resolveConflictAt(view: EditorView, index: number, choice: ConflictChoice): void {
  const region = view.state.field(conflictField)[index];
  if (!region) {
    return;
  }
  const edit = resolveEdit(view.state.doc, region, choice);
  if (edit) {
    view.dispatch({ changes: edit, userEvent: "input.resolve" });
  }
}

export function resolveAllConflicts(view: EditorView, choice: ConflictChoice): void {
  const edits = resolveAllEdits(view.state.doc, view.state.field(conflictField), choice);
  if (edits.length > 0) {
    view.dispatch({ changes: edits, userEvent: "input.resolve" });
  }
}

class ActionsWidget extends WidgetType {
  constructor(
    readonly index: number,
    readonly total: number,
    readonly actions: ConflictActions,
  ) {
    super();
  }

  eq(other: ActionsWidget): boolean {
    return other.index === this.index && other.total === this.total;
  }

  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "cm-conflict-actions";
    const add = (label: string, title: string, run: () => void, extraClass = "") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.className = `cm-conflict-action ${extraClass}`.trim();
      // Keep the editor selection where it is.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        run();
      });
      bar.appendChild(button);
    };
    const separator = () => {
      const dot = document.createElement("span");
      dot.className = "cm-conflict-sep";
      dot.textContent = "|";
      bar.appendChild(dot);
    };
    add("Accept Current Change", "Keep the current (HEAD) side", () => resolveConflictAt(view, this.index, "current"));
    separator();
    add("Accept Incoming Change", "Keep the incoming side", () => resolveConflictAt(view, this.index, "incoming"));
    separator();
    add("Accept Both Changes", "Keep both, current first", () => resolveConflictAt(view, this.index, "both"));
    separator();
    add(
      "Resolve in Merge Tool",
      "Open the 3-way merge tool for this file",
      () => this.actions.onOpenMergeTool(),
      "merge-tool",
    );
    if (this.total > 1) {
      const counter = document.createElement("span");
      counter.className = "cm-conflict-count";
      counter.textContent = `Conflict ${this.index + 1} of ${this.total}`;
      bar.appendChild(counter);
    }
    return bar;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class LabelWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: LabelWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const label = document.createElement("span");
    label.className = "cm-conflict-label";
    label.textContent = this.text;
    return label;
  }
}

const lineClass = (className: string) => Decoration.line({ class: className });
const markerCurrent = lineClass("cm-conflict-marker cm-conflict-marker-current");
const markerBase = lineClass("cm-conflict-marker cm-conflict-marker-base");
const markerSeparator = lineClass("cm-conflict-marker cm-conflict-marker-separator");
const markerIncoming = lineClass("cm-conflict-marker cm-conflict-marker-incoming");
const contentCurrent = lineClass("cm-conflict-current");
const contentBase = lineClass("cm-conflict-base");
const contentIncoming = lineClass("cm-conflict-incoming");

function buildDecorations(regions: ConflictRegion[], doc: Text, actions: ConflictActions): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const lineFrom = (index: number) => doc.line(index + 1).from;
  const lineTo = (index: number) => doc.line(index + 1).to;
  const markLines = (from: number, to: number, decoration: Decoration) => {
    for (let index = from; index < to; index++) {
      decorations.push(decoration.range(lineFrom(index)));
    }
  };
  regions.forEach((region, index) => {
    decorations.push(
      Decoration.widget({ widget: new ActionsWidget(index, regions.length, actions), block: true, side: -1 }).range(
        lineFrom(region.start),
      ),
    );
    decorations.push(markerCurrent.range(lineFrom(region.start)));
    decorations.push(
      Decoration.widget({ widget: new LabelWidget("(Current Change)"), side: 1 }).range(lineTo(region.start)),
    );
    const currentEnd = region.baseMarker ?? region.separator;
    markLines(region.start + 1, currentEnd, contentCurrent);
    if (region.baseMarker !== null) {
      decorations.push(markerBase.range(lineFrom(region.baseMarker)));
      markLines(region.baseMarker + 1, region.separator, contentBase);
    }
    decorations.push(markerSeparator.range(lineFrom(region.separator)));
    markLines(region.separator + 1, region.end, contentIncoming);
    decorations.push(markerIncoming.range(lineFrom(region.end)));
    decorations.push(
      Decoration.widget({ widget: new LabelWidget("(Incoming Change)"), side: 1 }).range(lineTo(region.end)),
    );
  });
  return Decoration.set(decorations, true);
}

/**
 * The actions bar is a block inside the editor content, and the content never
 * shrinks below its widest child, so on its own the row never runs out of room
 * to wrap and the counter slides off screen. Capping it at the visible width
 * (measured here, gutters left out) makes it wrap where you can see it.
 */
const barWidth = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      this.measure();
    }

    update(update: ViewUpdate): void {
      if (update.geometryChanged) {
        this.measure();
      }
    }

    measure(): void {
      this.view.requestMeasure({
        read: (view) => {
          const scroller = view.scrollDOM.getBoundingClientRect();
          const contentLeft = view.contentDOM.getBoundingClientRect().left - scroller.left + view.scrollDOM.scrollLeft;
          return view.scrollDOM.clientWidth - contentLeft;
        },
        write: (width, view) => {
          const barWidth = Math.max(Math.floor(width), componentTokens.conflictActions.minWidth);
          view.dom.style.setProperty("--cm-conflict-bar-width", `${barWidth}px`);
        },
      });
    }
  },
);

export function conflictMarkers(actions: ConflictActions): Extension {
  return [
    conflictField,
    EditorView.decorations.compute([conflictField], (state) =>
      buildDecorations(state.field(conflictField), state.doc, actions),
    ),
    conflictTheme,
    barWidth,
  ];
}
