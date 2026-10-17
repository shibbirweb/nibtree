// The editors' look on the design tokens, shared by CodeEditor, DiffView and MergeView: the same values as the
// app's editor, diff and merge themes, so every pane matches.
import { EditorView } from "@codemirror/view";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--code-size)",
    backgroundColor: "var(--editor-bg)",
    color: "var(--text)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    fontWeight: "var(--code-weight, 400)",
    lineHeight: "var(--code-line-height, 1.25)",
  },
  ".cm-content": { caretColor: "var(--editor-cursor)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--editor-cursor)" },
  ".cm-gutters": { backgroundColor: "var(--editor-gutter)", color: "var(--editor-line-number)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 var(--code-editor-gutter-padding-right) 0 var(--code-editor-gutter-padding-left)",
    minWidth: "var(--code-editor-gutter-min-width)",
  },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--editor-active-line)", color: "var(--text-dim)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--editor-selection)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--warning) 30%, transparent)", outline: "none" },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--warning) 62%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--warning) 85%, transparent)",
  },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" },
});

export const diffTheme = EditorView.theme({
  "&.cm-merge-a .cm-content .cm-line.cm-changedLine, &.cm-merge-b .cm-content .cm-line.cm-changedLine": {
    backgroundColor: "var(--diff-modified)",
  },
  "&.cm-merge-b .cm-content .cm-line.cm-changedLine.cm-diffAdded": { backgroundColor: "var(--diff-added)" },
  "&.cm-merge-a .cm-content .cm-line.cm-changedLine.cm-diffDeleted": { backgroundColor: "var(--diff-deleted)" },
  "&.cm-merge-a .cm-content .cm-line .cm-changedText, &.cm-merge-b .cm-content .cm-line .cm-changedText": {
    background: "var(--diff-inline)",
    borderRadius: "var(--inline-diff-change-radius)",
  },
  "&.cm-merge-a .cm-content .cm-diffDeleted .cm-changedText, &.cm-merge-b .cm-content .cm-diffAdded .cm-changedText": {
    background: "none",
  },
  // A side by side diff's number rows take the change's color with no edge lines, like its text.
  "&.cm-merge-a .cm-gutters .cm-gutterElement.cm-mc-gutter, &.cm-merge-b .cm-gutters .cm-gutterElement.cm-mc-gutter": {
    "--mc-edge": "transparent",
  },
  "&.cm-merge-a .cm-gutters .cm-changedLineGutter, &.cm-merge-b .cm-gutters .cm-changedLineGutter": {
    background: "var(--diff-modified-edge)",
  },
});

/** The one-column diff's lines. Side by side, CodeMirror marks added text with the same class, so it stays out of
 *  `diffTheme`: there it would paint a second green over the line's own. */
export const unifiedDiffTheme = EditorView.theme({
  ".cm-deletedChunk": { backgroundColor: "var(--diff-deleted)" },
  ".cm-insertedLine": { backgroundColor: "var(--diff-added)" },
  ".cm-deletedLine": { backgroundColor: "var(--diff-deleted)" },
});

export const mergeTheme = EditorView.theme({
  ".cm-mc-line.cm-mc-modified": { backgroundColor: "var(--diff-modified)", "--mc-edge": "var(--diff-modified-edge)" },
  ".cm-mc-line.cm-mc-added": { backgroundColor: "var(--diff-added)", "--mc-edge": "var(--diff-added-edge)" },
  ".cm-mc-line.cm-mc-deleted": { backgroundColor: "var(--diff-deleted)", "--mc-edge": "var(--diff-deleted-edge)" },
  ".cm-mc-line.cm-mc-conflict": { backgroundColor: "var(--diff-conflict)", "--mc-edge": "var(--diff-conflict-edge)" },
  ".cm-mc-first": { boxShadow: "inset 0 1px 0 var(--mc-edge)" },
  ".cm-mc-last": { boxShadow: "inset 0 -1px 0 var(--mc-edge)" },
  ".cm-mc-single": { boxShadow: "inset 0 1px 0 var(--mc-edge), inset 0 -1px 0 var(--mc-edge)" },
  ".cm-mc-edge-modified": { "--mc-edge": "var(--diff-modified-edge)" },
  ".cm-mc-edge-added": { "--mc-edge": "var(--diff-added-edge)" },
  ".cm-mc-edge-deleted": { "--mc-edge": "var(--diff-deleted-edge)" },
  ".cm-mc-edge-conflict": { "--mc-edge": "var(--diff-conflict-edge)" },
  ".cm-mc-inline": { backgroundColor: "var(--diff-inline)", borderRadius: "var(--merge-view-inline-radius)" },
  // An empty side of a change: a line where its lines would be.
  ".cm-mc-gap-before": { boxShadow: "inset 0 var(--merge-view-gap-edge) 0 var(--mc-edge)" },
  ".cm-mc-gap-after": { boxShadow: "inset 0 calc(-1 * var(--merge-view-gap-edge)) 0 var(--mc-edge)" },
  // Keep the active-line tint from hiding chunk colors.
  ".cm-activeLine.cm-mc-line": {
    backgroundImage: "linear-gradient(var(--editor-active-line), var(--editor-active-line))",
    backgroundBlendMode: "multiply",
  },
});
