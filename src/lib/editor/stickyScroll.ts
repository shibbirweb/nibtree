// Sticky scroll: the first
// lines of the blocks around the top of the screen stay pinned above the file editor, at
// most five. Blocks come from the syntax tree (the nodes a language can fold), markdown
// uses its headings and files without a grammar their indentation. Only the line at the top
// is looked at, so the cost does not grow with the file. Clicking a pinned line jumps to it.

import { foldNodeProp, language, StreamLanguage, syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { highlightTree } from "@lezer/highlight";
import { codeHighlighters } from "@nibtree/ui/editor/highlighter";
import { componentTokens } from "@nibtree/ui/tokens";
import {
  headingScopes,
  indentScopes,
  type LineText,
  MAX_STICKY_LINES,
  type Scope,
  stickyLinesFor,
} from "./stickyScope";
import { stickyScrollTheme } from "@nibtree/ui/editor/overlayThemes";

/** The line number gutter's right padding (codeEditor.gutterPaddingRight), so sticky numbers line up. */
const GUTTER_PADDING_RIGHT = componentTokens.codeEditor.gutterPaddingRight;

/** Longest stretch of a pinned line that is drawn; the rest is off screen anyway. */
const MAX_DRAWN_CHARS = 400;

function lineTextOf(state: EditorState): LineText {
  return (lineNumber) => state.doc.line(lineNumber).text;
}

/** Scopes from the nodes around the line that the language can fold. */
function treeScopes(state: EditorState, lineNumber: number): Scope[] {
  const { doc } = state;
  const line = doc.line(lineNumber);
  const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
  const scopes: Scope[] = [];
  let node = syntaxTree(state).resolveInner(line.from + indent, 1);
  for (let parent = node.parent; parent; node = parent, parent = parent.parent) {
    const fold = node.type.prop(foldNodeProp);
    if (!fold || !fold(node, state)) {
      continue;
    }
    let start = node.from;
    // A block after a long signature starts on its ") {" line; the signature names it.
    if (parent.to === node.to && /^\s*[)\]]/.test(doc.lineAt(start).text)) {
      start = parent.from;
    }
    const startLine = doc.lineAt(start).number;
    const endLine = doc.lineAt(node.to).number;
    if (startLine < endLine) {
      scopes.push({ startLine, endLine });
    }
  }
  return scopes;
}

/** How the blocks of this state's language are found. */
export function scopeSource(state: EditorState): (lineNumber: number) => Scope[] {
  const lang = state.facet(language);
  const lineText = lineTextOf(state);
  if (lang?.name === "markdown") {
    return (lineNumber) => headingScopes(lineText, lineNumber);
  }
  if (!lang || lang instanceof StreamLanguage) {
    return (lineNumber) => indentScopes(lineText, state.doc.lines, lineNumber, state.tabSize);
  }
  return (lineNumber) => treeScopes(state, lineNumber);
}

/** Highlighted text of a line, as spans with the same tok-* classes as the editor. */
function renderLine(state: EditorState, lineNumber: number): DocumentFragment {
  const line = state.doc.line(lineNumber);
  const to = Math.min(line.to, line.from + MAX_DRAWN_CHARS);
  const fragment = document.createDocumentFragment();
  let position = line.from;
  const text = (from: number, end: number, className: string) => {
    if (end <= from) {
      return;
    }
    const content = state.doc.sliceString(from, end);
    if (className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = content;
      fragment.appendChild(span);
    } else {
      fragment.appendChild(document.createTextNode(content));
    }
  };
  highlightTree(
    syntaxTree(state),
    codeHighlighters,
    (from, end, className) => {
      text(position, from, "");
      text(Math.max(from, position), Math.min(end, to), className);
      position = Math.max(position, Math.min(end, to));
    },
    line.from,
    to,
  );
  text(position, to, "");
  return fragment;
}

interface StickyMeasure {
  lines: number[];
  top: number;
  left: number;
  width: number;
  rowHeight: number;
  gutterWidth: number;
  numberRight: number;
  textLeft: number;
}

const plugin = ViewPlugin.fromClass(
  class {
    readonly dom: HTMLDivElement;
    /** The drawn lines and the document they came from, so an unchanged frame draws nothing. */
    drawnKey = "";
    lastState: EditorState | null = null;
    /** The lines found for a top line, so scrolling within a line looks nothing up again. */
    foundKey = "";
    foundState: EditorState | null = null;
    found: number[] = [];

    constructor(readonly view: EditorView) {
      this.dom = document.createElement("div");
      this.dom.className = "cm-gm-sticky";
      this.dom.style.display = "none";
      this.dom.setAttribute("aria-hidden", "true");
      this.dom.addEventListener("mousedown", this.onMouseDown);
      view.dom.appendChild(this.dom);
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      this.schedule();
    }

    onScroll = (): void => {
      this.schedule();
    };

    onMouseDown = (event: MouseEvent): void => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".cm-gm-sticky-row");
      if (!row?.dataset.line || event.button !== 0) {
        return;
      }
      event.preventDefault();
      const lineNumber = Number(row.dataset.line);
      const index = Number(row.dataset.index ?? 0);
      const { doc } = this.view.state;
      if (lineNumber < 1 || lineNumber > doc.lines) {
        return;
      }
      const position = doc.line(lineNumber).from;
      this.view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: "start", yMargin: index * this.view.defaultLineHeight }),
      });
      this.view.focus();
    };

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
        write: (measure) => this.draw(measure),
      });
    }

    measure(view: EditorView): StickyMeasure {
      const scroller = view.scrollDOM.getBoundingClientRect();
      const editor = view.dom.getBoundingClientRect();
      const heightAtTop = (scroller.top - view.documentTop) / view.scaleY;
      const rowHeight = view.defaultLineHeight;
      const empty: StickyMeasure = {
        lines: [],
        top: 0,
        left: 0,
        width: 0,
        rowHeight,
        gutterWidth: 0,
        numberRight: 0,
        textLeft: 0,
      };
      if (heightAtTop <= 1) {
        return empty;
      }
      const { state } = view;
      const lineAt = (height: number) => state.doc.lineAt(view.lineBlockAtHeight(height).from).number;
      const top = lineAt(heightAtTop);
      const below = Array.from({ length: MAX_STICKY_LINES }, (_unused, index) =>
        lineAt(heightAtTop + (index + 1) * rowHeight),
      );
      const key = `${top}|${below.join(",")}`;
      if (
        key !== this.foundKey ||
        this.foundState?.doc !== state.doc ||
        syntaxTree(this.foundState) !== syntaxTree(state)
      ) {
        this.foundKey = key;
        this.foundState = state;
        this.found = stickyLinesFor(
          top,
          scopeSource(state),
          (count) => below[count - 1] ?? top + count,
          lineTextOf(state),
        );
      }
      const lines = this.found;
      if (lines.length === 0) {
        return empty;
      }
      const gutters = view.dom.querySelector(".cm-gutters")?.getBoundingClientRect();
      const numbers = view.dom.querySelector(".cm-lineNumbers")?.getBoundingClientRect();
      const content = view.contentDOM.getBoundingClientRect();
      const line = view.contentDOM.querySelector(".cm-line");
      const padding = line ? parseFloat(getComputedStyle(line).paddingLeft) || 0 : 6;
      return {
        lines,
        top: (scroller.top - editor.top) / view.scaleY,
        left: (scroller.left - editor.left) / view.scaleX,
        width: view.scrollDOM.clientWidth,
        rowHeight,
        gutterWidth: gutters ? gutters.width / view.scaleX : 0,
        numberRight: numbers ? (numbers.right - scroller.left) / view.scaleX : 0,
        textLeft: (content.left - scroller.left) / view.scaleX + padding,
      };
    }

    draw(measure: StickyMeasure): void {
      const { dom, view } = this;
      if (measure.lines.length === 0) {
        dom.style.display = "none";
        this.drawnKey = "";
        return;
      }
      dom.style.display = "";
      dom.style.top = `${measure.top}px`;
      dom.style.left = `${measure.left}px`;
      dom.style.width = `${measure.width}px`;
      dom.style.lineHeight = `${measure.rowHeight}px`;
      dom.style.tabSize = String(view.state.tabSize);
      const key = `${measure.lines.join(",")}|${measure.gutterWidth}|${measure.numberRight}|${measure.rowHeight}`;
      if (
        key !== this.drawnKey ||
        this.lastState?.doc !== view.state.doc ||
        syntaxTree(this.lastState) !== syntaxTree(view.state)
      ) {
        this.drawnKey = key;
        this.lastState = view.state;
        dom.replaceChildren(...measure.lines.map((lineNumber, index) => this.row(lineNumber, index, measure)));
      }
      // Horizontal scrolling only moves the text.
      const offset = `${measure.textLeft - measure.gutterWidth}px`;
      for (const text of dom.querySelectorAll<HTMLElement>(".cm-gm-sticky-text")) {
        text.style.left = offset;
      }
    }

    row(lineNumber: number, index: number, measure: StickyMeasure): HTMLElement {
      const row = document.createElement("div");
      row.className = "cm-gm-sticky-row";
      row.dataset.line = String(lineNumber);
      row.dataset.index = String(index);
      row.style.height = `${measure.rowHeight}px`;
      if (measure.gutterWidth > 0) {
        const number = document.createElement("div");
        number.className = "cm-gm-sticky-number";
        number.style.width = `${measure.gutterWidth}px`;
        number.style.height = `${measure.rowHeight}px`;
        // Line up with the line number gutter, which may have other gutters after it.
        const numberPadding = measure.gutterWidth - measure.numberRight + GUTTER_PADDING_RIGHT;
        number.style.paddingRight = `${Math.max(0, numberPadding)}px`;
        number.textContent = measure.numberRight > 0 ? String(lineNumber) : "";
        row.appendChild(number);
      }
      const clip = document.createElement("div");
      clip.className = "cm-gm-sticky-clip";
      clip.style.left = `${measure.gutterWidth}px`;
      const text = document.createElement("div");
      text.className = "cm-gm-sticky-text";
      text.appendChild(renderLine(this.view.state, lineNumber));
      clip.appendChild(text);
      row.appendChild(clip);
      return row;
    }

    destroy(): void {
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
      this.dom.remove();
    }
  },
);

export function stickyScroll(): Extension {
  return [plugin, stickyScrollTheme];
}
