// Indent guides: faint vertical lines at each indent level. Only the lines on screen are
// measured, and a guide down a whole block is a single element in a CodeMirror layer.

import { getIndentUnit } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, layer, RectangleMarker, type ViewUpdate } from "@codemirror/view";
import { textOrigin } from "./layerGeometry";
import { indentGuideTheme } from "@nibtree/ui/editor/guideThemes";

/** How far a blank line looks up and down for the code around it. */
const MAX_BLANK_SCAN = 200;

/** Columns of leading whitespace, a tab reaching the next tab stop; null for a blank line. */
export function indentColumns(text: string, tabSize: number): number | null {
  let columns = 0;
  for (const char of text) {
    if (char === " ") {
      columns++;
    } else if (char === "\t") {
      columns += tabSize - (columns % tabSize);
    } else {
      return columns;
    }
  }
  return null;
}

/** Guides of a line with code: one per indent level its indentation starts. */
export function levelsFor(columns: number, unitColumns: number): number {
  return unitColumns > 0 ? Math.ceil(columns / unitColumns) : 0;
}

/**
 * Guides of a blank line from the levels of the nearest code above and below (null when
 * there is none): a guide runs on through the blank lines of a block.
 */
export function blankLevels(above: number | null, below: number | null): number {
  if (above === null || below === null) {
    return 0;
  }
  if (above < below) {
    return above + 1;
  }
  if (above === below) {
    return above;
  }
  return below + 1;
}

/**
 * Guide levels of lines `from` to `to` (1-based, inclusive). `lineText` reads any line, so
 * blank lines at the edges can look past the range.
 */
export function guideLevels(
  lineText: (lineNumber: number) => string,
  lineCount: number,
  from: number,
  to: number,
  tabSize: number,
  unitColumns: number,
): number[] {
  const levelAt = (lineNumber: number): number | null => {
    const columns = indentColumns(lineText(lineNumber), tabSize);
    return columns === null ? null : levelsFor(columns, unitColumns);
  };
  const nearest = (start: number, step: 1 | -1): number | null => {
    for (
      let lineNumber = start, scanned = 0;
      lineNumber >= 1 && lineNumber <= lineCount && scanned < MAX_BLANK_SCAN;
      lineNumber += step, scanned++
    ) {
      const level = levelAt(lineNumber);
      if (level !== null) {
        return level;
      }
    }
    return null;
  };
  const levels: number[] = [];
  let above = nearest(from - 1, -1);
  let lineNumber = from;
  while (lineNumber <= to) {
    const level = levelAt(lineNumber);
    if (level !== null) {
      levels.push(level);
      above = level;
      lineNumber++;
      continue;
    }
    // A run of blank lines shares the code below it, found once for the whole run.
    let runEnd = lineNumber;
    while (runEnd + 1 <= to && levelAt(runEnd + 1) === null) {
      runEnd++;
    }
    const below = nearest(runEnd + 1, 1);
    const blank = blankLevels(above, below);
    for (let index = lineNumber; index <= runEnd; index++) {
      levels.push(blank);
    }
    lineNumber = runEnd + 1;
  }
  return levels;
}

/** A line block on screen: its top and height in pixels and its guide count. */
export interface GuideBlock {
  top: number;
  height: number;
  levels: number;
  /** Wrapped over several rows; the later rows start at column 0, so only the first row gets guides. */
  wrapped: boolean;
}

/** A guide drawn as one line: the indent level it marks and where it starts and ends. */
export interface GuideRun {
  level: number;
  top: number;
  bottom: number;
}

/** Joins the guides of touching blocks, so a guide down a long block is one element. */
export function guideRuns(blocks: readonly GuideBlock[], rowHeight: number): GuideRun[] {
  const runs: GuideRun[] = [];
  const open: (GuideRun | null)[] = [];
  const close = (level: number): void => {
    const run = open[level];
    if (run) {
      runs.push(run);
      open[level] = null;
    }
  };
  for (const block of blocks) {
    const bottom = block.top + (block.wrapped ? Math.min(rowHeight, block.height) : block.height);
    const deepest = Math.max(open.length, block.levels);
    for (let level = 0; level < deepest; level++) {
      if (level >= block.levels) {
        close(level);
        continue;
      }
      const run = open[level];
      // Blocks touch unless something (a widget, a gap) sits between them.
      if (run && Math.abs(run.bottom - block.top) < 0.5) {
        run.bottom = bottom;
      } else {
        close(level);
        open[level] = { level, top: block.top, bottom };
      }
      if (block.wrapped) {
        close(level);
      }
    }
  }
  open.forEach((_run, level) => close(level));
  return runs.sort((a, b) => a.level - b.level || a.top - b.top);
}

function markers(view: EditorView): readonly RectangleMarker[] {
  const blocks = view.viewportLineBlocks;
  if (blocks.length === 0) {
    return [];
  }
  const { doc } = view.state;
  const first = doc.lineAt(blocks[0].from).number;
  const last = doc.lineAt(blocks[blocks.length - 1].from).number;
  const unitColumns = getIndentUnit(view.state);
  const levels = guideLevels(
    (lineNumber) => doc.line(lineNumber).text,
    doc.lines,
    first,
    last,
    view.state.tabSize,
    unitColumns,
  );
  const rowHeight = view.defaultLineHeight;
  const guideBlocks = blocks.map((block) => ({
    top: block.top,
    height: block.height,
    levels: levels[doc.lineAt(block.from).number - first] ?? 0,
    wrapped: block.height > rowHeight * 1.5,
  }));
  const { left, top } = textOrigin(view);
  const step = unitColumns * view.defaultCharacterWidth;
  return guideRuns(guideBlocks, rowHeight).map(
    (run) =>
      new RectangleMarker("cm-gm-indentGuide", left + run.level * step, top + run.top, null, run.bottom - run.top),
  );
}

/**
 * Indent guides for an editor. They are a layer above the text, like the cursor, so the
 * active line's background never hides them; they only cross indentation, which is blank.
 */
export function indentGuides(): Extension {
  return [
    layer({
      above: true,
      class: "cm-gm-indentLayer",
      markers,
      update: (update: ViewUpdate) =>
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        update.startState.tabSize !== update.state.tabSize ||
        getIndentUnit(update.startState) !== getIndentUnit(update.state),
    }),
    indentGuideTheme,
  ];
}
