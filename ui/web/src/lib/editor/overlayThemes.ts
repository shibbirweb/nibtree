// The look of what the editor draws over or beside its text: the minimap, sticky scroll, the change overview ruler
// next to the scrollbar and the change bars beside the line numbers.
import { EditorView } from "@codemirror/view";

export const minimapTheme = EditorView.theme({
  "&.cm-with-minimap .cm-scroller": { marginRight: "var(--minimap-width)" },
  "&.cm-with-minimap.cm-with-scroll-markers .cm-scroller": {
    marginRight: "calc(var(--minimap-width) + var(--scroll-markers-width))",
  },
  ".cm-gm-minimap": {
    position: "absolute",
    right: "0",
    width: "var(--minimap-width)",
    zIndex: "4",
    overflow: "hidden",
    backgroundColor: "var(--editor-bg)",
    borderLeft: "1px solid color-mix(in srgb, var(--border-strong) 60%, transparent)",
    boxSizing: "border-box",
  },
  "&.cm-with-scroll-markers .cm-gm-minimap": { right: "var(--scroll-markers-width)" },
  ".cm-gm-minimap canvas": {
    position: "absolute",
    left: "0",
    top: "0",
  },
  ".cm-gm-minimap-slider": {
    position: "absolute",
    left: "0",
    right: "0",
    backgroundColor: "color-mix(in srgb, var(--text) 9%, transparent)",
  },
  ".cm-gm-minimap:hover .cm-gm-minimap-slider": {
    backgroundColor: "color-mix(in srgb, var(--text) 14%, transparent)",
  },
  ".cm-gm-minimap-slider.dragging": {
    backgroundColor: "color-mix(in srgb, var(--text) 20%, transparent)",
  },
  ".cm-gm-minimap-probe": {
    position: "absolute",
    visibility: "hidden",
  },
});

export const stickyScrollTheme = EditorView.baseTheme({
  ".cm-gm-sticky": {
    position: "absolute",
    zIndex: "4",
    overflow: "hidden",
    backgroundColor: "var(--editor-bg)",
    borderBottom: "1px solid var(--border-strong)",
    fontFamily: "var(--font-mono)",
    fontWeight: "var(--code-weight, 400)",
    cursor: "pointer",
  },
  ".cm-gm-sticky-row": {
    position: "relative",
    whiteSpace: "pre",
  },
  ".cm-gm-sticky-row:hover": {
    backgroundColor: "var(--hover)",
  },
  ".cm-gm-sticky-number": {
    position: "absolute",
    left: "0",
    top: "0",
    textAlign: "right",
    color: "var(--editor-line-number)",
    backgroundColor: "var(--editor-gutter)",
    boxSizing: "border-box",
  },
  ".cm-gm-sticky-clip": {
    position: "absolute",
    top: "0",
    right: "0",
    bottom: "0",
    overflow: "hidden",
  },
  ".cm-gm-sticky-text": {
    position: "absolute",
    top: "0",
  },
});

// Strip and tick styles live in the library's styles/code.css so the diff view can reuse them outside an editor.
export const scrollStripTheme = EditorView.theme({
  "&.cm-with-scroll-markers .cm-scroller": { marginRight: "var(--scroll-markers-width)" },
  "&.cm-scroll-markers-at-start .cm-scroller": { marginRight: "0", marginLeft: "var(--scroll-markers-width)" },
  "&.cm-scroll-markers-on-text .cm-scroller": { marginRight: "0" },
});

export const changeGutterTheme = EditorView.theme({
  ".cm-change-gutter": { width: "var(--change-gutter-width)" },
  ".cm-change-gutter .cm-gutterElement": { position: "relative", padding: "0" },
  ".cm-change-bar": { position: "absolute", left: "0", width: "var(--change-gutter-bar)", top: "0", bottom: "0" },
  ".cm-change-bar-added": { background: "var(--diff-added-edge)" },
  ".cm-change-bar-modified": { background: "var(--diff-modified-edge)" },
  ".cm-change-bar-conflict": { background: "var(--danger)" },
  // Deletions sit between lines: a small wedge on the next line's top edge.
  ".cm-change-bar-deleted": {
    bottom: "auto",
    height: "0",
    width: "0",
    top: "calc(-1 * var(--change-gutter-deleted-half))",
    borderTop: "var(--change-gutter-deleted-half) solid transparent",
    borderBottom: "var(--change-gutter-deleted-half) solid transparent",
    borderLeft: "var(--change-gutter-deleted-depth) solid var(--danger)",
  },
  ".cm-change-bar-deleted.at-end": { top: "auto", bottom: "calc(-1 * var(--change-gutter-deleted-half))" },
  ".cm-change-clickable .cm-change-bar:not(.cm-change-bar-conflict)": { cursor: "pointer" },
});
