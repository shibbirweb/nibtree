// Overview ruler next to the scrollbar: one colored tick per change, placed
// proportionally to the document, clickable to jump there. Plus a matching
// change gutter for plain editors.

import { type EditorState, type Extension, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { EditorView, GutterMarker, gutter, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { ChangeMark } from "./lineDiff";
import { changeGutterTheme, scrollStripTheme } from "@nibtree/ui/editor/overlayThemes";

export const setChangeMarks = StateEffect.define<ChangeMark[]>();

/** Change marks pushed into an editor from outside (e.g. a diff against HEAD). */
export const changeMarkField = StateField.define<ChangeMark[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setChangeMarks)) {
        return effect.value;
      }
    }
    return value;
  },
});

export type MarkSource = (state: EditorState) => readonly ChangeMark[];

export const fieldSource: MarkSource = (state) => state.field(changeMarkField, false) ?? [];

export interface Tick {
  top: number;
  height: number;
  kind: ChangeMark["kind"];
  line: number;
}

const MIN_TICK = 3;

/**
 * Converts line marks to strip coordinates. `view` supplies line heights and
 * `trackHeight` is the strip's height in pixels.
 */
export function layoutTicks(view: EditorView, marks: readonly ChangeMark[], trackHeight: number): Tick[] {
  const doc = view.state.doc;
  const total = Math.max(1, view.contentHeight);
  const scale = trackHeight / total;
  const ticks: Tick[] = [];
  for (const mark of marks) {
    const firstLine = Math.min(mark.from, doc.lines - 1);
    const top = view.lineBlockAt(doc.line(firstLine + 1).from).top;
    let bottom = top;
    if (mark.to > mark.from) {
      const lastLine = Math.min(mark.to, doc.lines) - 1;
      bottom = view.lineBlockAt(doc.line(lastLine + 1).from).bottom;
    }
    const tick: Tick = {
      top: top * scale,
      height: Math.max(MIN_TICK, (bottom - top) * scale),
      kind: mark.kind,
      line: firstLine,
    };
    // Merge ticks of the same kind that would overlap on screen.
    const last = ticks[ticks.length - 1];
    if (last && last.kind === tick.kind && tick.top <= last.top + last.height + 1) {
      last.height = Math.max(last.height, tick.top + tick.height - last.top);
    } else {
      ticks.push(tick);
    }
  }
  return ticks;
}

export function renderTicks(strip: HTMLElement, ticks: Tick[]): void {
  strip.replaceChildren(
    ...ticks.map((tick) => {
      const element = document.createElement("div");
      element.className = `cm-scroll-mark cm-scroll-mark-${tick.kind}`;
      element.style.top = `${tick.top}px`;
      element.style.height = `${tick.height}px`;
      element.dataset.line = String(tick.line);
      element.title = `${tick.kind.charAt(0).toUpperCase()}${tick.kind.slice(1)} at line ${tick.line + 1}`;
      return element;
    }),
  );
}

/** Scrolls `view` so the 0-based `line` is centered and puts the cursor there. */
export function jumpToLine(view: EditorView, line: number): void {
  const doc = view.state.doc;
  const position = doc.line(Math.min(line + 1, doc.lines)).from;
  view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
}

export function createStrip(onJump: (line: number) => void): HTMLDivElement {
  const strip = document.createElement("div");
  strip.className = "cm-scroll-markers";
  strip.setAttribute("aria-hidden", "true");
  strip.addEventListener("mousedown", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".cm-scroll-mark");
    if (target?.dataset.line) {
      event.preventDefault();
      onJump(Number(target.dataset.line));
    }
  });
  return strip;
}

/** `end` beside the scrollbar, `start` at the left edge, `onText` over the lines' ends (merge colors run under). */
export type StripPlace = "end" | "start" | "onText";

/** Overview ruler for an editor that scrolls itself. */
export function scrollMarkers(source: MarkSource = fieldSource, place: StripPlace = "end"): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      strip: HTMLDivElement;
      marks: readonly ChangeMark[];

      constructor(readonly view: EditorView) {
        this.strip = createStrip((line) => jumpToLine(view, line));
        view.dom.appendChild(this.strip);
        this.marks = source(view.state);
        this.schedule();
      }

      update(update: ViewUpdate): void {
        const next = source(update.state);
        if (next !== this.marks || update.docChanged || update.geometryChanged || update.heightChanged) {
          this.marks = next;
          this.schedule();
        }
      }

      schedule(): void {
        this.view.requestMeasure({
          key: this,
          read: (view) => layoutTicks(view, this.marks, this.strip.clientHeight),
          write: (ticks) => renderTicks(this.strip, ticks),
        });
      }

      destroy(): void {
        this.strip.remove();
      }
    },
  );
  const placeClass = { end: "", start: " cm-scroll-markers-at-start", onText: " cm-scroll-markers-on-text" }[place];
  return [plugin, scrollStripTheme, EditorView.editorAttributes.of({ class: `cm-with-scroll-markers${placeClass}` })];
}

class ChangeGutterMarker extends GutterMarker {
  constructor(
    readonly kind: ChangeMark["kind"],
    readonly atEnd = false,
  ) {
    super();
  }

  eq(other: ChangeGutterMarker): boolean {
    return other.kind === this.kind && other.atEnd === this.atEnd;
  }

  toDOM(): Node {
    const element = document.createElement("div");
    element.className = `cm-change-bar cm-change-bar-${this.kind}${this.atEnd ? " at-end" : ""}`;
    return element;
  }
}

const gutterMarkers = {
  added: new ChangeGutterMarker("added"),
  modified: new ChangeGutterMarker("modified"),
  deleted: new ChangeGutterMarker("deleted"),
  deletedAtEnd: new ChangeGutterMarker("deleted", true),
  conflict: new ChangeGutterMarker("conflict"),
};

/** Gutter markers for `marks` (0-based line ranges) in `doc`. */
export function buildGutterSet(doc: EditorState["doc"], marks: readonly ChangeMark[]): RangeSet<GutterMarker> {
  const ranges = [];
  const sorted = [...marks].sort((a, b) => a.from - b.from);
  for (const mark of sorted) {
    if (mark.to > mark.from) {
      const marker =
        mark.kind === "conflict"
          ? gutterMarkers.conflict
          : mark.kind === "added"
            ? gutterMarkers.added
            : gutterMarkers.modified;
      for (let line = mark.from; line < Math.min(mark.to, doc.lines); line++) {
        ranges.push(marker.range(doc.line(line + 1).from));
      }
    } else if (mark.from < doc.lines) {
      ranges.push(gutterMarkers.deleted.range(doc.line(mark.from + 1).from));
    } else {
      ranges.push(gutterMarkers.deletedAtEnd.range(doc.line(doc.lines).from));
    }
  }
  return RangeSet.of(ranges, true);
}

/** The gutter's markers and the marks they were built from. */
export interface GutterCache {
  marks: readonly ChangeMark[] | null;
  set: RangeSet<GutterMarker>;
}

/**
 * The gutter's markers for a state. Marks are line numbers that only change when they are
 * computed again, so the markers are built once from them and then moved with every edit by
 * the field: typing in a heavily changed file does not rebuild the whole gutter.
 */
export function gutterMarkerSource(source: MarkSource): {
  field: StateField<GutterCache>;
  markers: (state: EditorState) => RangeSet<GutterMarker>;
} {
  const field = StateField.define<GutterCache>({
    create: () => ({ marks: null, set: RangeSet.empty }),
    update: (cache, tr) =>
      tr.docChanged && cache.marks ? { marks: cache.marks, set: cache.set.map(tr.changes) } : cache,
  });
  const markers = (state: EditorState): RangeSet<GutterMarker> => {
    const marks = source(state);
    const cache = state.field(field);
    if (cache.marks !== marks) {
      // A cache, not state: rebuilt in place for this state, then moved by the field.
      cache.marks = marks;
      cache.set = buildGutterSet(state.doc, marks);
    }
    return cache.set;
  };
  return { field, markers };
}

/** The bar on the line starting at `position`, null for none. */
function barAt(set: RangeSet<GutterMarker>, position: number): ChangeGutterMarker | null {
  let found: ChangeGutterMarker | null = null;
  set.between(position, position, (from, _to, marker) => {
    if (from === position && marker instanceof ChangeGutterMarker) {
      found = marker;
      return false;
    }
  });
  return found;
}

/**
 * Colored bars beside the line numbers for each changed line. With `onBarClick`, a click on a change's bar
 * (not a conflict's) calls it with the clicked 0-based line.
 */
export function changeGutter(source: MarkSource = fieldSource, onBarClick?: (line: number) => void): Extension {
  const { field, markers } = gutterMarkerSource(source);
  const clicks: Record<string, (view: EditorView, line: { from: number }, event: Event) => boolean> = onBarClick
    ? {
        mousedown: (view: EditorView, line: { from: number }, event: Event) => {
          const bar = barAt(markers(view.state), line.from);
          if (!bar || bar.kind === "conflict" || (event as MouseEvent).button !== 0) {
            return false;
          }
          event.preventDefault();
          onBarClick(view.state.doc.lineAt(line.from).number - 1);
          return true;
        },
      }
    : {};
  return [
    field,
    gutter({
      class: onBarClick ? "cm-change-gutter cm-change-clickable" : "cm-change-gutter",
      markers: (view) => markers(view.state),
      domEventHandlers: clicks,
    }),
    changeGutterTheme,
  ];
}
