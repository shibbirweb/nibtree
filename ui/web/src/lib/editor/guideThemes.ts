// The look of the editor's guides: bracket pair colors, whitespace marks, indent guides and the column ruler. The
// app's extensions draw them; the colors and sizes come from the design tokens.
import { EditorView } from "@codemirror/view";

export const bracketColorTheme = EditorView.baseTheme({
  ".cm-gm-bracket-1": { color: "var(--bracket-1)" },
  ".cm-gm-bracket-2": { color: "var(--bracket-2)" },
  ".cm-gm-bracket-3": { color: "var(--bracket-3)" },
  ".cm-gm-bracket-unmatched": { color: "var(--tok-invalid)" },
});

export const whitespaceTheme = EditorView.baseTheme({
  // One dot per space: the tile is one character wide in the monospace font.
  ".cm-ws-space": {
    // A small, light dot (about 1.5 px across at the default size).
    backgroundImage: "radial-gradient(circle at 50% 52%, var(--text-faint) 0.045em, transparent 0.07em)",
    backgroundSize: "1ch 100%",
    backgroundRepeat: "repeat-x",
  },
  // A thin line with an arrowhead across the whole tab.
  ".cm-ws-tab": {
    position: "relative",
  },
  ".cm-ws-tab::before": {
    content: '""',
    position: "absolute",
    left: "0.2em",
    right: "0.25em",
    top: "52%",
    borderTop: "1px solid var(--text-faint)",
    pointerEvents: "none",
  },
  ".cm-ws-tab::after": {
    content: '""',
    position: "absolute",
    right: "0.25em",
    top: "52%",
    width: "0.3em",
    height: "0.6em",
    transform: "translate(0.5px, -50%)",
    backgroundColor: "var(--text-faint)",
    mask:
      `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 12">` +
      `<path d="M0.5 0.5L5.5 6L0.5 11.5" fill="none" stroke="black" stroke-width="1.2"/></svg>') ` +
      "center / 100% 100% no-repeat",
    pointerEvents: "none",
  },
});

export const indentGuideTheme = EditorView.baseTheme({
  ".cm-gm-indentLayer": {
    pointerEvents: "none",
  },
  ".cm-gm-indentGuide": {
    borderLeft: "1px solid color-mix(in srgb, var(--text-faint) 38%, transparent)",
  },
});

export const rulerTheme = EditorView.baseTheme({
  ".cm-gm-rulerLayer": {
    pointerEvents: "none",
  },
  ".cm-gm-ruler": {
    borderLeft: "1px solid color-mix(in srgb, var(--text-faint) 45%, transparent)",
  },
});
