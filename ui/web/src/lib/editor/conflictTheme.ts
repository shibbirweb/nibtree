// The look of conflict markers in a file: each side's tint, the marker lines and the Accept buttons above them.
import { EditorView } from "@codemirror/view";

export const conflictTheme = EditorView.theme({
  // Wraps within the visible width (see barWidth) so the counter at the end stays in view.
  ".cm-conflict-actions": {
    display: "flex",
    flexWrap: "wrap",
    boxSizing: "border-box",
    maxWidth: "var(--cm-conflict-bar-width, none)",
    alignItems: "center",
    gap: "var(--conflict-actions-gap-y) var(--conflict-actions-gap-x)",
    padding:
      "var(--conflict-actions-padding-top) 0 var(--conflict-actions-padding-bottom) " +
      "var(--conflict-actions-padding-left)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--conflict-actions-font-size)",
    color: "var(--text-dim)",
  },
  ".cm-conflict-action": {
    padding: "0 var(--conflict-actions-action-padding-x)",
    whiteSpace: "nowrap",
    border: "none",
    background: "transparent",
    color: "var(--text-dim)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-conflict-action:hover": {
    color: "var(--accent)",
    textDecoration: "underline",
  },
  ".cm-conflict-action.merge-tool": {
    color: "var(--accent)",
    fontWeight: "500",
  },
  ".cm-conflict-sep": {
    color: "var(--text-faint)",
  },
  ".cm-conflict-count": {
    marginLeft: "var(--conflict-actions-count-gap)",
    padding: "0 var(--conflict-actions-count-padding-right) 0 var(--conflict-actions-count-padding-left)",
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-conflict-label": {
    marginLeft: "var(--conflict-actions-label-gap)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--conflict-actions-label-font-size)",
    color: "var(--text-dim)",
  },
  ".cm-conflict-marker": {
    fontWeight: "600",
  },
  ".cm-conflict-marker-current": {
    backgroundColor: "color-mix(in srgb, var(--success) 30%, transparent)",
  },
  ".cm-conflict-current": {
    backgroundColor: "color-mix(in srgb, var(--success) 13%, transparent)",
  },
  ".cm-conflict-marker-base": {
    backgroundColor: "color-mix(in srgb, var(--text-dim) 22%, transparent)",
  },
  ".cm-conflict-base": {
    backgroundColor: "color-mix(in srgb, var(--text-dim) 9%, transparent)",
  },
  ".cm-conflict-marker-separator": {
    backgroundColor: "color-mix(in srgb, var(--text-dim) 14%, transparent)",
  },
  ".cm-conflict-incoming": {
    backgroundColor: "color-mix(in srgb, var(--accent) 13%, transparent)",
  },
  ".cm-conflict-marker-incoming": {
    backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
  },
});
