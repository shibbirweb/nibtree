// The look of blame: the gutter with each line's author and date, and the dim note after the current line.
import { EditorView } from "@codemirror/view";

export const blameTheme = EditorView.theme({
  ".cm-gm-blameLayer": {
    pointerEvents: "none",
  },
  ".cm-gm-blameLayer .cm-inline-blame": {
    position: "absolute",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: "var(--text-faint)",
    fontFamily: "var(--font-ui)",
    fontSize: "0.9em",
    fontStyle: "italic",
    pointerEvents: "none",
  },
  // Only while Cmd (Ctrl elsewhere) is held: then it is a link to the commit.
  ".cm-scroller[data-gm-blame-click] .cm-gm-blameLayer .cm-inline-blame": {
    pointerEvents: "auto",
    cursor: "pointer",
    color: "var(--text-dim)",
    textDecoration: "underline",
  },
  ".cm-blame-gutter": {
    width: "var(--blame-gutter-width)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-blame-gutter .cm-gutterElement": {
    padding: "0",
  },
  ".cm-blame-cell": {
    height: "100%",
    padding: "0 var(--blame-cell-padding-right) 0 var(--blame-cell-padding-left)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-ui)",
    fontSize: "0.88em",
    color: "var(--text-dim)",
    borderLeft: "var(--blame-heat-bar) solid color-mix(in srgb, var(--accent) var(--blame-heat), transparent)",
    cursor: "pointer",
  },
  ".cm-blame-cell.first": {
    borderTop: "1px solid var(--border)",
  },
  ".cm-blame-cell.uncommitted": {
    borderLeftColor: "var(--warning)",
    fontStyle: "italic",
  },
});
