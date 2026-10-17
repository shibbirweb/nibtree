// The look of the editor's cursor: its shape (line, block, underline, with or without an outline), how wide it is,
// how it blinks and how far it reaches above and below the text. The app picks the options from its settings.

export type CursorStyle = "line" | "line-thin" | "block" | "block-outline" | "underline" | "underline-thin";
export type CursorBlinking = "blink" | "smooth" | "phase" | "expand" | "solid";

export interface CursorOptions {
  style: CursorStyle;
  /** Width of the Line cursor in pixels. */
  width: number;
  blinking: CursorBlinking;
  smoothCaret: boolean;
  extraTop: number;
  extraBottom: number;
}

type Declarations = Record<string, string>;
/** Selectors to declarations; a keyframes rule maps its steps to declarations. */
type StyleSpec = Record<string, Declarations | Record<string, Declarations>>;

/** One blink cycle, CodeMirror's default rate. */
export const BLINK_MS = 1200;

/** The cursor elements CodeMirror draws (not the drop cursor of drag and drop). */
const CURSOR = ".cm-cursorLayer .cm-cursor";
/** Set by `charWidth` from the editor's measured character width. */
const CHAR_WIDTH = "var(--gm-char-width, 0.6em)";
const COLOR = "var(--editor-cursor)";

function shapeOf(style: CursorStyle, width: number): Declarations {
  switch (style) {
    case "line":
    case "line-thin": {
      const pixels = style === "line-thin" ? 1 : width;
      return { borderLeft: `${pixels}px solid ${COLOR}`, marginLeft: `${-pixels / 2}px` };
    }
    case "block":
      // See-through so the character under it stays readable in every theme.
      return {
        borderLeft: "none",
        marginLeft: "0",
        width: CHAR_WIDTH,
        backgroundColor: `color-mix(in srgb, ${COLOR} 55%, transparent)`,
      };
    case "block-outline":
      return {
        borderLeft: "none",
        marginLeft: "0",
        width: CHAR_WIDTH,
        outline: `1px solid ${COLOR}`,
        outlineOffset: "-1px",
      };
    case "underline":
    case "underline-thin":
      return {
        borderLeft: "none",
        marginLeft: "0",
        width: CHAR_WIDTH,
        borderBottom: `${style === "underline-thin" ? 1 : 2}px solid ${COLOR}`,
      };
  }
}

/** Keyframes and timing of each blinking mode. */
const BLINKS: Record<Exclude<CursorBlinking, "solid">, { frames: Record<string, Declarations>; timing: string }> = {
  // On and off with visibility: an opacity animation would make the cursor a GPU layer of its own.
  blink: {
    frames: { "0%": {}, "50%": { visibility: "hidden" }, "100%": {} },
    timing: `${BLINK_MS}ms steps(1) infinite`,
  },
  smooth: {
    frames: { "0%, 20%": { opacity: "1" }, "60%, 100%": { opacity: "0" } },
    timing: `${BLINK_MS / 2}ms ease-in-out infinite alternate`,
  },
  phase: {
    frames: { "0%, 20%": { opacity: "1" }, "90%, 100%": { opacity: "0" } },
    timing: `${BLINK_MS / 2}ms ease-in-out infinite alternate`,
  },
  expand: {
    frames: { "0%, 20%": { transform: "scaleY(1)" }, "80%, 100%": { transform: "scaleY(0)" } },
    timing: `${BLINK_MS / 2}ms ease-in-out infinite alternate`,
  },
};

/** The EditorView.theme spec for these options. */
export function cursorThemeSpec(options: CursorOptions): StyleSpec {
  const cursor: Declarations = { ...shapeOf(options.style, options.width) };
  if (options.extraTop > 0 || options.extraBottom > 0) {
    // Padding grows the element beyond the height CodeMirror sets; the border and fill cover it.
    Object.assign(cursor, {
      boxSizing: "content-box",
      paddingTop: `${options.extraTop}px`,
      paddingBottom: `${options.extraBottom}px`,
      marginTop: `${-options.extraTop}px`,
    });
  }
  if (options.smoothCaret) {
    cursor.transition = "left 80ms ease-out, top 80ms ease-out";
  }
  const spec: StyleSpec = {
    [CURSOR]: cursor,
    // CodeMirror blinks the whole layer; the cursors blink themselves instead.
    "&.cm-focused > .cm-scroller > .cm-cursorLayer": { animation: "none !important" },
  };
  if (options.blinking !== "solid") {
    const blink = BLINKS[options.blinking];
    // Two copies of the keyframes: switching between them restarts the blink after each move.
    for (const copy of ["a", "b"]) {
      const name = `gm-cursor-${options.blinking}-${copy}`;
      spec[`@keyframes ${name}`] = blink.frames;
      spec[`& .cm-scroller[data-gm-blink="${copy}"] ${CURSOR}`] = { animation: `${name} ${blink.timing}` };
    }
  }
  return spec;
}
