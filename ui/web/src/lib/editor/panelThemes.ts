// The look of the panels and popups CodeMirror draws: the find and go-to panels, the fold gutter's chevrons and
// the completion list with its kind badges.
import { EditorView } from "@codemirror/view";

// The editor look comes from the library (design tokens); the app adds only the panels CodeMirror draws.
export const panelTheme = EditorView.theme({
  ".cm-panels": {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    borderColor: "var(--border-strong)",
  },
  ".cm-panels input, .cm-panels button": {
    fontFamily: "var(--font-ui)",
  },
  // The find bar draws its own bottom border.
  ".cm-panels.cm-panels-top": {
    borderBottom: "none",
  },
});

const foldChevron =
  `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">` +
  `<path d="M2 3.5L5 6.5L8 3.5" fill="none" stroke="black" stroke-width="1.3" stroke-linecap="round" ` +
  `stroke-linejoin="round"/></svg>') center / 100% 100% no-repeat`;

export const foldGutterTheme = EditorView.baseTheme({
  ".cm-foldGutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "var(--editor-fold-gutter-width)",
    cursor: "pointer",
  },
  // Open blocks show their arrow while the pointer is over the gutter, folded ones always.
  ".cm-gm-fold": {
    width: "var(--editor-fold-icon)",
    height: "var(--editor-fold-icon)",
    backgroundColor: "var(--text-faint)",
    mask: foldChevron,
  },
  ".cm-gm-fold-open": {
    opacity: "0",
    transition: "opacity 120ms",
  },
  ".cm-gutters:hover .cm-gm-fold-open": {
    opacity: "1",
  },
  ".cm-gm-fold-closed": {
    transform: "rotate(-90deg)",
  },
  ".cm-foldGutter .cm-gutterElement:hover .cm-gm-fold": {
    backgroundColor: "var(--text)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
    color: "var(--text-dim)",
    borderRadius: "var(--editor-fold-placeholder-radius)",
    padding: "0 var(--editor-fold-placeholder-padding-x)",
    margin: "0 var(--editor-fold-placeholder-margin-x)",
  },
});

/** Badge letter and color token by completion type; keywords and words get none. */
const COMPLETION_BADGES: Record<string, [string, string]> = {
  function: ["f", "--warning"],
  method: ["m", "--warning"],
  property: ["p", "--warning"],
  class: ["c", "--accent"],
  variable: ["v", "--accent"],
  namespace: ["n", "--accent"],
  interface: ["i", "--success"],
  type: ["t", "--success"],
  enum: ["e", "--success"],
  constant: ["c", "--danger"],
  keyword: ["", ""],
  text: ["", ""],
};

function completionBadges(): Record<string, Record<string, string | Record<string, string>>> {
  return Object.fromEntries(
    Object.entries(COMPLETION_BADGES).map(([type, [letter, token]]) => [
      `.cm-completionIcon-${type}`,
      {
        backgroundColor: token ? `color-mix(in srgb, var(${token}) 18%, transparent)` : "transparent",
        color: token ? `var(${token})` : "var(--text-faint)",
        "&:after": { content: `'${letter}'`, fontSize: "100%", verticalAlign: "baseline" },
      },
    ]),
  );
}

export const completionTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--editor-completion-radius)",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--code-size)",
    maxHeight: "16em",
    minWidth: "var(--editor-completion-min-width)",
    padding: "var(--editor-completion-list-padding-y) 0",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding:
      "var(--editor-completion-item-padding-y) var(--editor-completion-item-padding-right) " +
      "var(--editor-completion-item-padding-y) var(--editor-completion-item-padding-left)",
    lineHeight: "1.6",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--selected)",
    color: "var(--text)",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--accent)",
    fontWeight: "600",
  },
  ".cm-completionDetail": {
    color: "var(--text-faint)",
    fontStyle: "normal",
    marginLeft: "1.2em",
  },
  // Letter badges instead of CodeMirror's symbols and emoji.
  ".cm-completionIcon": {
    width: "1.35em",
    height: "1.35em",
    lineHeight: "1.35em",
    padding: "0",
    marginRight: "0.6em",
    borderRadius: "50%",
    fontFamily: "var(--font-ui)",
    fontSize: "72%",
    fontWeight: "600",
    textAlign: "center",
    verticalAlign: "middle",
    opacity: "1",
  },
  ...completionBadges(),
  ".cm-tooltip.cm-completionInfo": {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--editor-completion-radius)",
    boxShadow: "var(--shadow)",
  },
});
