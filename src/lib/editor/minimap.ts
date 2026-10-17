// The minimap: a small picture of the file beside the
// scrollbar of the file editor. Written here rather than taken from a package, so it keeps
// nothing per line: one canvas holds the lines that fit (two pixels each) plus a margin,
// with the syntax colors of the editor. Scrolling moves the canvas and the slider (plain
// elements); the canvas is painted again only when the shown lines leave the painted ones,
// or after an edit, at most a few times a second. Click, drag and the wheel scroll the editor.

import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import { codeHighlighters } from "@nibtree/ui/editor/highlighter";
import {
  canvasShift,
  lineRuns,
  MINIMAP_CHAR,
  MINIMAP_ROW,
  MINIMAP_WIDTH,
  type MinimapLayout,
  minimapLayout,
  type PaintWindow,
  paintWindow,
  type StyledRange,
  topLineForClick,
  topLineForDrag,
  windowCovers,
} from "./minimapModel";
import { minimapTheme } from "@nibtree/ui/editor/overlayThemes";

/** Gap left of the painted text. */
const LEFT_PAD = 4;

/** Edits paint the canvas again at most this often. */
const EDIT_PAINT_MS = 150;

interface MinimapMeasure {
  /** Where the minimap sits in the editor and how tall it is. */
  top: number;
  height: number;
  topLine: number;
  visibleLines: number;
  /** scrollTop of the scroller at the top of the document, to scroll to a line without a transaction. */
  documentOffset: number;
}

/** Syntax styles of `from` to `to`, in order. */
function styledRanges(state: EditorState, from: number, to: number): StyledRange[] {
  const ranges: StyledRange[] = [];
  highlightTree(
    syntaxTree(state),
    codeHighlighters,
    (start, end, className) => ranges.push({ from: start, to: end, className }),
    from,
    to,
  );
  return ranges;
}

const plugin = ViewPlugin.fromClass(
  class {
    readonly dom: HTMLDivElement;
    readonly canvas: HTMLCanvasElement;
    readonly slider: HTMLDivElement;
    readonly probe: HTMLSpanElement;
    readonly themeObserver: MutationObserver;
    readonly darkQuery: MediaQueryList;
    colors = new Map<string, string>();
    last: MinimapMeasure | null = null;
    layout: MinimapLayout | null = null;
    /** The lines the canvas holds and the state and size they were painted for. */
    painted: PaintWindow | null = null;
    paintedState: EditorState | null = null;
    paintedSize = "";
    paintedAt = 0;
    paintTimer: ReturnType<typeof setTimeout> | undefined;
    drag: { startY: number; startTopLine: number } | null = null;

    constructor(readonly view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.className = "cm-gm-minimap";
      this.dom.setAttribute("aria-hidden", "true");
      this.canvas = document.createElement("canvas");
      this.slider = document.createElement("div");
      this.slider.className = "cm-gm-minimap-slider";
      this.probe = document.createElement("span");
      this.probe.className = "cm-gm-minimap-probe";
      this.dom.append(this.canvas, this.slider, this.probe);
      view.dom.appendChild(this.dom);
      this.dom.addEventListener("mousedown", this.onMouseDown);
      this.dom.addEventListener("wheel", this.onWheel, { passive: false });
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      // Theme switches change the token colors; forget them so the next paint reads them again.
      this.themeObserver = new MutationObserver(this.onThemeChange);
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-color-theme", "style", "class"],
      });
      this.darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.darkQuery.addEventListener("change", this.onThemeChange);
      this.schedule();
    }

    onThemeChange = (): void => {
      this.colors.clear();
      this.painted = null;
      this.schedule();
    };

    onScroll = (): void => {
      this.schedule();
    };

    onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      this.view.scrollDOM.scrollBy({ top: event.deltaY, left: 0 });
    };

    onMouseDown = (event: MouseEvent): void => {
      const { last, layout } = this;
      if (event.button !== 0 || !last || !layout) {
        return;
      }
      event.preventDefault();
      const lineCount = this.view.state.doc.lines;
      const y = event.clientY - this.dom.getBoundingClientRect().top;
      let startTopLine = last.topLine;
      if (event.target !== this.slider) {
        startTopLine = topLineForClick(layout, y, lineCount, last.visibleLines);
        this.scrollToTopLine(startTopLine);
      }
      this.drag = { startY: event.clientY, startTopLine };
      this.slider.classList.add("dragging");
      window.addEventListener("mousemove", this.onDragMove);
      window.addEventListener("mouseup", this.onDragEnd);
    };

    onDragMove = (event: MouseEvent): void => {
      if (!this.drag || !this.last) {
        return;
      }
      const lineCount = this.view.state.doc.lines;
      this.scrollToTopLine(
        topLineForDrag(
          this.drag.startTopLine,
          event.clientY - this.drag.startY,
          lineCount,
          this.last.visibleLines,
          this.last.height,
        ),
      );
    };

    onDragEnd = (): void => {
      this.drag = null;
      this.slider.classList.remove("dragging");
      window.removeEventListener("mousemove", this.onDragMove);
      window.removeEventListener("mouseup", this.onDragEnd);
    };

    /** Scrolls so the 0-based `topLine` (with a fraction) is at the top. */
    scrollToTopLine(topLine: number): void {
      const { doc } = this.view.state;
      const index = Math.min(Math.floor(topLine), doc.lines - 1);
      const block = this.view.lineBlockAt(doc.line(index + 1).from);
      this.view.scrollDOM.scrollTop = (this.last?.documentOffset ?? 0) + block.top + (topLine - index) * block.height;
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        update.heightChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.schedule();
      }
    }

    schedule(): void {
      this.view.requestMeasure({
        key: this,
        read: (view) => this.measure(view),
        write: (measure) => this.paint(measure),
      });
    }

    measure(view: EditorView): MinimapMeasure {
      const scroller = view.scrollDOM.getBoundingClientRect();
      const editor = view.dom.getBoundingClientRect();
      const heightAtTop = Math.max(0, (scroller.top - view.documentTop) / view.scaleY);
      const block = view.lineBlockAtHeight(heightAtTop);
      const lineIndex = view.state.doc.lineAt(block.from).number - 1;
      const fraction = block.height > 0 ? Math.min(1, Math.max(0, (heightAtTop - block.top) / block.height)) : 0;
      const height = view.scrollDOM.clientHeight;
      return {
        top: (scroller.top - editor.top) / view.scaleY,
        height,
        topLine: lineIndex + fraction,
        visibleLines: Math.max(1, height / view.defaultLineHeight),
        documentOffset: (view.documentTop - scroller.top) / view.scaleY + view.scrollDOM.scrollTop,
      };
    }

    paint(measure: MinimapMeasure): void {
      this.last = measure;
      const { state } = this.view;
      const layout = minimapLayout({
        lineCount: state.doc.lines,
        topLine: measure.topLine,
        visibleLines: measure.visibleLines,
        height: measure.height,
      });
      this.layout = layout;
      this.dom.style.top = `${measure.top}px`;
      this.dom.style.height = `${measure.height}px`;
      this.slider.style.top = `${layout.sliderTop}px`;
      this.slider.style.height = `${layout.sliderHeight}px`;
      const ratio = window.devicePixelRatio || 1;
      const size = `${measure.height}|${ratio}`;
      const sameText = this.paintedState?.doc === state.doc && syntaxTree(this.paintedState) === syntaxTree(state);
      const covered = size === this.paintedSize && windowCovers(this.painted, layout);
      // After an edit the old picture stays a moment, so typing does not paint every key.
      const waitForEdits = covered && !sameText && performance.now() - this.paintedAt < EDIT_PAINT_MS;
      if (waitForEdits) {
        this.paintTimer ??= setTimeout(() => {
          this.paintTimer = undefined;
          this.schedule();
        }, EDIT_PAINT_MS);
      }
      if (!covered || (!sameText && !waitForEdits)) {
        this.painted = paintWindow(layout, state.doc.lines);
        this.paintedState = state;
        this.paintedSize = size;
        this.paintedAt = performance.now();
        this.drawLines(state, this.painted, ratio);
      }
      if (this.painted) {
        this.canvas.style.transform = `translateY(${-canvasShift(this.painted, layout)}px)`;
      }
    }

    colorOf(className: string): string {
      let color = this.colors.get(className);
      if (color === undefined) {
        this.probe.className = `cm-gm-minimap-probe ${className}`;
        color = getComputedStyle(this.probe).color;
        this.colors.set(className, color);
      }
      return color;
    }

    drawLines(state: EditorState, painted: PaintWindow, ratio: number): void {
      const { canvas } = this;
      const width = MINIMAP_WIDTH;
      const height = Math.max(1, painted.lineCount * MINIMAP_ROW);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const { doc } = state;
      if (painted.lineCount <= 0) {
        return;
      }
      const firstLine = doc.line(painted.firstLine + 1);
      const lastNumber = Math.min(doc.lines, painted.firstLine + painted.lineCount);
      const styles = styledRanges(state, firstLine.from, doc.line(lastNumber).to);
      const maxColumns = Math.floor((width - LEFT_PAD) / MINIMAP_CHAR);
      context.globalAlpha = 0.8;
      let fill = "";
      let position = firstLine.from;
      let row = 0;
      for (const iterator = doc.iterLines(painted.firstLine + 1, lastNumber + 1); !iterator.next().done; row++) {
        const text = iterator.value;
        for (const run of lineRuns(text, position, styles, state.tabSize, maxColumns)) {
          const color = this.colorOf(run.className);
          if (color !== fill) {
            fill = color;
            context.fillStyle = color;
          }
          context.fillRect(
            LEFT_PAD + run.column * MINIMAP_CHAR,
            row * MINIMAP_ROW,
            run.length * MINIMAP_CHAR,
            MINIMAP_ROW - 0.5,
          );
        }
        position += text.length + 1;
      }
    }

    destroy(): void {
      clearTimeout(this.paintTimer);
      this.onDragEnd();
      this.themeObserver.disconnect();
      this.darkQuery.removeEventListener("change", this.onThemeChange);
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
      this.dom.remove();
    }
  },
);

export function minimap(): Extension {
  return [plugin, minimapTheme, EditorView.editorAttributes.of({ class: "cm-with-minimap" })];
}
