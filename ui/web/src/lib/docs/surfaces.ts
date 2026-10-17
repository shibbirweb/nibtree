import { prop, type ComponentDoc } from "./types";

const LANGUAGE = '"plain" | "ts" | "js" | "svelte" | "html" | "css" | "json" | "md" | "python" | "rust"';
const VIEW_HEIGHT = '"fill" | "small" | "medium" | "large"';
const EXTENSIONS = "Extension[]";

export const surfaceDocs: ComponentDoc[] = [
  {
    name: "CodeEditor",
    group: "Editor",
    summary: "An editable code view in the app's editor look: line numbers, active line, selection, syntax colors.",
    usage:
      "Use for any editable text: files, Untitled tabs, commit messages with code. The app adds blame, find, " +
      "folding and change markers through `extensions`; read-only code to show only is CodeView.",
    aliases: ["Editor", "Code editor", "CodeMirror"],
    props: [
      prop("value", "string", "The text.", { default: '""', bindable: true }),
      prop("language", LANGUAGE, "Syntax colors; each language loads on first use.", { default: '"plain"' }),
      prop("readOnly", "boolean", "No typing, still selectable.", { default: "false" }),
      prop("lineNumbers", "boolean", "The line number gutter.", { default: "true" }),
      prop("wrap", "boolean", "Wrap long lines.", { default: "false" }),
      prop("height", VIEW_HEIGHT, "Fill the parent, or 160, 240 or 360 px.", { default: '"fill"' }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("extensions", EXTENSIONS, "More CodeMirror extensions from the app.", { default: "[]" }),
      prop("onchange", "(value: string) => void", "Called after each edit."),
    ],
    examples: [{ title: "A file", code: '<CodeEditor label="main.ts" language="ts" bind:value={text} />' }],
    replaces: ["the CodeMirror setup in src/lib/views/files/FileView.svelte", "UntitledView.svelte"],
    rules: ["Never style .cm-* classes in a screen: colors come from the editor theme."],
  },
  {
    name: "DiffView",
    group: "Editor",
    summary: "Two versions of a text compared, side by side or inline, in the app's diff colors.",
    usage:
      "Use for file diffs, the Changes diff and compare tabs. Side by side, each side's line numbers face the " +
      "other and a change's color runs through them (editor/splitGutters.ts). The app adds staging buttons " +
      "(`splitPaneGutters`, beside the numbers), folds (editor/foldRow.ts) and its other diff features through " +
      "`extensions`.",
    aliases: ["Diff", "Compare"],
    props: [
      prop("original", "string", "The old text (left, or the removed lines).", { required: true, data: true }),
      prop("modified", "string", "The new text.", { required: true, data: true }),
      prop("layout", '"split" | "inline"', "Side by side, or one column.", { default: '"split"' }),
      prop("language", LANGUAGE, "Syntax colors.", { default: '"plain"' }),
      prop("height", VIEW_HEIGHT, "Fill the parent, or 160, 240 or 360 px.", { default: '"fill"' }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("sideLabels", "{ original: string; modified: string } | null", "Names over the two sides.", {
        default: "null",
      }),
      prop("ratio", "number", "The split between the sides; drag the handle to change it.", {
        default: "0.5",
        bindable: true,
        data: true,
      }),
      prop("oncommitratio", "(ratio: number) => void", "A drag or a key ended: save the ratio."),
      prop("extensions", EXTENSIONS, "More CodeMirror extensions, on both sides.", { default: "[]" }),
    ],
    examples: [{ title: "A file's change", code: '<DiffView label="app.ts" {original} {modified} language="ts" />' }],
    replaces: ["src/lib/views/changes/ChangesDiff.svelte panes"],
  },
  {
    name: "DiffFrame",
    group: "Editor",
    summary: "The frame of a diff whose editors the app builds: side names, find bar slots, body, split handle.",
    usage:
      "Use when the app builds the diff's CodeMirror editors itself (staging, blame, folds). `onready` hands over " +
      "the body and a find bar container per side; labels, find bars and editors share `ratio`. Without " +
      "`onapply` and `onrevert` the connector draws ribbons alone in a narrow gap, as when the sides carry the " +
      "buttons in their gutters (editor/splitGutters.ts). DiffView is built on it.",
    aliases: ["Diff", "Diff host"],
    props: [
      prop("layout", '"split" | "inline"', "Side by side, or one column with one label and one find bar.", {
        default: '"split"',
      }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("sideLabels", "{ original: string; modified: string } | null", "Names over the two sides.", {
        default: "null",
      }),
      prop("ribbons", "ConnectorRibbon[] | null", "Side by side: a band per change joining its lines on both " +
        "sides, measured from the body's top; each side then scrolls itself.", { default: "null", data: true }),
      prop("applySide", '"left" | "right"', "Which side's change the arrow on a band applies.", {
        default: '"left"',
      }),
      prop("onapply", "(index: number) => void", "Shows an arrow on each band, such as Stage this change."),
      prop("applyTitle", "string | null", "The arrow's tooltip.", { default: "null" }),
      prop("onrevert", "(index: number) => void", "Shows a revert button on each band, such as Revert this change."),
      prop("revertTitle", "string | null", "The revert button's tooltip.", { default: "null" }),
      prop("colors", "ConnectorColors", 'Ribbons by kind ("kinds"), or red to green: "oldToNew" or "newToOld".', {
        default: '"kinds"',
      }),
      prop("ruler", "boolean", "Room for a change overview ruler at the right of one editor.", { default: "false" }),
      prop("ratio", "number", "The split between the sides; drag the handle to change it.", {
        default: "0.5",
        bindable: true,
        data: true,
      }),
      prop("oncommitratio", "(ratio: number) => void", "A drag or a key ended: save the ratio."),
      prop("onready", "(parts: DiffFrameParts) => void | (() => void)", "The body and find bar hosts, once shown."),
      prop("oncontextmenu", "(event: MouseEvent) => void", "Right-click in the body, for the diff's menu."),
    ],
    rules: ["Never draw UI in the body: it holds only the editors the app builds."],
    examples: [
      {
        title: "The Changes diff",
        code: '<DiffFrame label="cart.ts" sideLabels={names} {ribbons} {onapply} ruler bind:ratio onready={build} />',
      },
    ],
    logic: ["splitRatio.ts"],
    replaces: ["src/lib/diff/DiffView.svelte (labels, find bars, body and split handle)"],
  },
  {
    name: "MergeFrame",
    group: "Editor",
    summary: "The frame of a 3-way merge whose editors the app builds: pane titles, three panes, connectors.",
    usage:
      "Use when the app builds the merge's CodeMirror editors itself (its own chunks, undo and scrolling). " +
      "`onready` hands over the three panes and the box the ribbons are measured from. Without `onapply`, " +
      "`onignore` and `onrevert` the connectors draw ribbons alone in narrow gaps, as when the panes carry the " +
      "buttons beside their line numbers (editor/mergeGutters.ts `paneGutters`). MergeView is built on it.",
    aliases: ["Merge", "Merge host"],
    props: [
      prop("label", "string", "Accessible name.", { required: true }),
      prop("labels", "{ left; result; right }", "Pane titles.", {
        default: '{ left: "Yours", result: "Result", right: "Theirs" }',
      }),
      prop("fileName", "string", "Shown dim after the result's title.", { default: '""' }),
      prop("height", VIEW_HEIGHT, "Fill the parent, or 160, 240 or 360 px.", { default: '"fill"' }),
      prop("leftRibbons", "ConnectorRibbon[]", "The left connector's ribbons, from the left pane to the result.", {
        default: "[]",
        data: true,
      }),
      prop("rightRibbons", "ConnectorRibbon[]", "The right connector's ribbons, from the result to the right pane.", {
        default: "[]",
        data: true,
      }),
      prop("onapply", '(index: number, side: "left" | "right") => void', "A chunk's Apply button; left out, none."),
      prop("onignore", '(index: number, side: "left" | "right") => void', "A chunk's Ignore button; left out, none."),
      prop("onrevert", '(index: number, side: "left" | "right") => void', "A chunk's Revert button; left out, none."),
      prop("applyTitles", "{ left: string; right: string } | null", "The Apply buttons' tooltips per side, such as " +
        "Unstage this change and Stage this change.", { default: "null" }),
      prop("revertTitle", "string | null", "The Revert buttons' tooltip.", { default: "null" }),
      prop("actionSides", '("left" | "right")[]', "The connectors whose chunks get buttons; the others draw " +
        "ribbons alone, such as a commit's change against the work tree.", { default: '["left", "right"]' }),
      prop("colors", "{ left: ConnectorColors; right: ConnectorColors }", "Each connector's ribbon colors.", {
        default: '{ left: "kinds", right: "kinds" }',
      }),
      prop("split", "ThreeSplit ([number, number])", "Where the left pane ends and the right pane starts, 0 to 1 " +
        "of the width the panes share; dragging a connector's edge moves it, double-click makes even thirds.", {
        default: "[1 / 3, 2 / 3]",
        bindable: true,
        data: true,
      }),
      prop("oncommitsplit", "(split: ThreeSplit) => void", "A drag ended or a key moved a pane edge: save it."),
      prop("onready", "(parts: MergeFrameParts) => void | (() => void)", "The panes, once shown."),
    ],
    rules: ["Never draw UI in the panes: they hold only the editors the app builds."],
    examples: [
      {
        title: "The merge tool",
        code: '<MergeFrame label="Merge" {labels} {leftRibbons} {rightRibbons} onapply={apply} onready={build} />',
      },
    ],
    logic: ["mergeGeometry.ts", "threeSplit.ts"],
    replaces: ["src/lib/merge/MergeEditor.svelte (pane titles, panes and connectors)"],
  },
  {
    name: "MergeStackFrame",
    group: "Editor",
    summary: "The stacked frame of a 3-way merge: yours and theirs side by side on top, the result below.",
    usage:
      "The other layout of MergeFrame, for a merge read top to bottom. Like it, it draws no editor: `onready` " +
      "hands over the three panes. It has no connectors, so the app marks each change with a lens of links " +
      "above it (editor/chunkLens.ts `chunkLenses`: Accept, Accept both, Ignore). Load it only when it is " +
      "picked, with a dynamic import. Drag the line under the top row, or between the top panes, to resize.",
    aliases: ["Merge", "Stacked merge", "Merge host"],
    props: [
      prop("label", "string", "Accessible name.", { required: true }),
      prop("labels", "{ left; result; right }", "Pane titles.", {
        default: '{ left: "Yours", result: "Result", right: "Theirs" }',
      }),
      prop("fileName", "string", "Shown dim after the result's title.", { default: '""' }),
      prop("topHeight", "number", "The top row's height in px; 0 starts it at half the frame.", {
        default: "0",
        bindable: true,
        data: true,
      }),
      prop("ratio", "number", "The split between the two top panes, 0 to 1.", {
        default: "0.5",
        bindable: true,
        data: true,
      }),
      prop("oncommit", "(topHeight: number, ratio: number) => void", "A drag ended: save the sizes."),
      prop("resultEnd", "Snippet", "At the end of the result's title, such as how many changes are left."),
      prop("onready", "(parts: MergeFrameParts) => void | (() => void)", "The panes, once shown."),
    ],
    rules: ["Never draw UI in the panes: they hold only the editors the app builds."],
    examples: [
      {
        title: "The merge tool, stacked",
        code: '<MergeStackFrame label="Merge" {labels} fileName="app.ts" onready={build} />',
      },
    ],
    replaces: ["a second merge layout"],
  },
  {
    name: "MergeView",
    group: "Editor",
    summary: "The 3-way merge: yours, the editable result and theirs, chunks tinted and joined by ribbons.",
    usage:
      "Use for resolving a conflicted file. The app computes the chunks (line ranges in each pane) and applies " +
      "a chunk when `onapply` is called; scrolling one pane scrolls the others. Each side's line numbers face the " +
      "result with its Apply and Ignore beside them, and a chunk's color runs through the numbers. Built on " +
      "MergeFrame.",
    aliases: ["Merge", "3-way merge", "Conflict"],
    props: [
      prop("left", "string", "Your version.", { required: true, data: true }),
      prop("result", "string", "The merged text being edited.", { default: '""', bindable: true }),
      prop("right", "string", "Their version.", { required: true, data: true }),
      prop("chunks", "MergeChunk[] ({ kind; left; result; right: [start, end) })",
        "Each change, with its line ranges.", { required: true, data: true }),
      prop("labels", "{ left; result; right }", "Pane titles.", {
        default: '{ left: "Yours", result: "Result", right: "Theirs" }',
      }),
      prop("fileName", "string", "Shown dim after the result's title.", { default: '""' }),
      prop("language", LANGUAGE, "Syntax colors.", { default: '"plain"' }),
      prop("height", VIEW_HEIGHT, "Fill the parent, or 160, 240 or 360 px.", { default: '"fill"' }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("extensions", EXTENSIONS, "More extensions for the result pane.", { default: "[]" }),
      prop("onapply", '(index: number, side: "left" | "right") => void', "Take a chunk's change from a side."),
      prop("onignore", '(index: number, side: "left" | "right") => void', "Drop a side's change."),
    ],
    examples: [
      { title: "A conflict", code: '<MergeView label="Merge" {left} {right} {chunks} bind:result onapply={apply} />' },
    ],
    logic: ["mergeGeometry.ts"],
    replaces: ["a merge of three plain texts (the app's merge tool uses MergeFrame)"],
  },
  {
    name: "MergeConnector",
    group: "Editor",
    summary: "The column between two merge or diff panes: a ribbon per chunk and its apply, ignore and revert buttons.",
    usage: "MergeFrame and DiffFrame draw this between their panes; use it alone only for a custom layout. Its " +
      "buttons stay inside the column while any of the chunk shows, and each shows only with its handler. " +
      "Without any handler it draws ribbons alone and is narrow; the app's views put their buttons in the " +
      "panes' gutters instead (editor/mergeGutters.ts).",
    aliases: ["Ribbon", "Connector"],
    props: [
      prop("ribbons", "ConnectorRibbon[] ({ index; kind; aTop; aBottom; bTop; bBottom })",
        "Each chunk's lines on both sides, in pixels from the column's top.", { required: true, data: true }),
      prop("side", '"left" | "right"', "Which pane the buttons apply from.", { required: true }),
      prop("onapply", "(index: number) => void", "Apply a chunk."),
      prop("onignore", "(index: number) => void", "Ignore a chunk."),
      prop("onrevert", "(index: number) => void", "Revert a chunk in the buttons' own pane."),
      prop("applyTitle", "string | null", "The apply button's tooltip, such as Stage this change.", {
        default: "null",
      }),
      prop("revertTitle", "string | null", "The revert button's tooltip, such as Revert this change.", {
        default: "null",
      }),
      prop("colors", "ConnectorColors", 'Ribbons by kind ("kinds"), or red to green: "oldToNew" or "newToOld".', {
        default: '"kinds"',
      }),
    ],
    examples: [{ title: "Between panes", code: '<MergeConnector side="left" {ribbons} onapply={apply} />' }],
    logic: ["mergeGeometry.ts"],
    replaces: ["the .connector SVG of src/lib/merge/MergeEditor.svelte"],
  },
];
