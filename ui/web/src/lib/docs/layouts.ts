import { prop, type ComponentDoc } from "./types";

export const layoutPartDocs: ComponentDoc[] = [
  {
    name: "SplitGrid",
    group: "Layout",
    summary: "The editor area split into groups placed by fractions, with lines (or rounded gaps) between them.",
    usage: "Use for Window > Split Right / Split Down. The app's split tree gives the rects; draw groups in `group`.",
    aliases: ["Editor groups", "Split view"],
    props: [
      prop("groups", "{ id; rect: { x; y; width; height } }[]", "Each group and its fractions of the area.", {
        required: true,
        data: true,
      }),
      prop("splitters", "{ id; direction: right|down; rect; ratio }[]", "Where the splits are.", {
        default: "[]",
        data: true,
      }),
      prop("look", '"flat" | "rounded"', "Lines between groups, or rounded panels apart.", { default: '"flat"' }),
      prop("focused", "string | null", "The focused group's id; its section gets aria-current.", { default: "null" }),
      prop("group", "Snippet<[G, index]>", "Draws a group (its tabs and editor) and its index.", { required: true }),
      prop("splitter", "Snippet<[GridSplitter]>", "Draws a split's ResizeHandle (inPanel)."),
      prop("onfocus", "(id: string) => void", "A group got focus or a click."),
    ],
    examples: [{ title: "Two groups", code: "<SplitGrid {groups} {splitters} {group} {splitter} />" }],
    logic: ["splitGrid.ts"],
    replaces: [".editor-area, .editor-group and .group-splitter in src/lib/views/Workspace.svelte"],
  },
  {
    name: "PaneRow",
    group: "Layout",
    summary: "Views side by side in one panel, like split terminals: shares of the width, lines between, focus line.",
    usage:
      "Use inside a positioned panel. With `onresize` a handle between two panes moves their split: it gets the " +
      "left pane's index, its new share of the whole width and the smallest share, for the app to store.",
    aliases: ["Split panes"],
    props: [
      prop("panes", "{ key; share: number }[]", "Each pane and its share of the width.", {
        required: true,
        data: true,
      }),
      prop("focused", "string | null", "The focused pane: an accent line on top.", { default: "null" }),
      prop("resizeLabel", "string", "Accessible name of the handles.", { default: '"Resize panes"' }),
      prop("pane", "Snippet<[P, index]>", "Draws a pane and its index.", { required: true }),
      prop("onresize", "(index: number, share: number, minShare: number) => void", "A handle moved a split."),
    ],
    examples: [{ title: "Terminals", code: "<PaneRow panes={panes} focused={key} {pane} />" }],
    replaces: [".panes and .pane in src/lib/terminal/TerminalPanel.svelte"],
  },
  {
    name: "SplitHandle",
    group: "Layout",
    states: ["hover", "dragging"],
    summary: "A handle between two side-by-side views in one box: drag or arrow keys move the split.",
    usage:
      "DiffFrame uses it between a diff's sides, MergeFrame on each connector's edge. Put it in a positioned box; " +
      "double-click puts it back at `resetRatio`.",
    aliases: ["Splitter"],
    props: [
      prop("ratio", "number", "The split, 0 to 1.", { default: "0.5", bindable: true, data: true }),
      prop("gutter", "number", "Px between the sides that never grow, such as a diff's change arrows.", {
        default: "0",
        data: true,
      }),
      prop("resetRatio", "number", "Where a double-click puts the split back.", { default: "0.5", data: true }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("oncommit", "(ratio: number) => void", "A drag ended or a key moved it: save it."),
    ],
    examples: [{ title: "Diff", code: '<SplitHandle bind:ratio label="Resize the sides" />' }],
    logic: ["splitRatio.ts"],
    replaces: [".split-handle in src/lib/diff/DiffView.svelte"],
  },
  {
    name: "RenameField",
    group: "Forms",
    summary: "A name edited in place: a small accent-bordered field; Enter keeps, Escape cancels, red when taken.",
    usage: "Use for renaming a terminal; Tree rows have their own.",
    aliases: ["Inline rename"],
    props: [
      prop("value", "string", "The current name.", { required: true, data: true }),
      prop("label", "string", "Accessible name.", { default: '"New name"' }),
      prop("invalid", "boolean", "The name cannot be used.", { default: "false" }),
      prop("onrename", "(name: string | null) => void", "The new name, or null to cancel.", { required: true }),
      prop("oninput", "(name: string) => void", "Each change, to check it."),
    ],
    examples: [{ title: "Terminal", code: '<RenameField value="zsh" onrename={rename} />' }],
    replaces: [".rename in src/lib/terminal/TerminalPanel.svelte"],
  },
  {
    name: "CornerCard",
    group: "Feedback",
    summary: "A small card in a view's bottom right corner with a message and a button, like The agent ended.",
    usage: "Put it in a TerminalView's children (or another positioned view).",
    aliases: ["Toast in view"],
    props: [
      prop("message", "string", "The message.", { required: true }),
      prop("action", "Snippet", "A button, such as Restart."),
    ],
    examples: [{ title: "Ended", code: '<CornerCard message="The agent ended.">...</CornerCard>' }],
    replaces: [".agent-ended in src/lib/terminal/TerminalView.svelte"],
  },
  {
    name: "DragGhost",
    group: "Feedback",
    summary: "The label that follows the pointer while files are dragged.",
    usage: "Show it while dragging rows; `x` and `y` are the pointer's position.",
    aliases: ["Drag preview"],
    props: [
      prop("text", "string", "Such as 3 files.", { required: true, data: true }),
      prop("x", "number", "The pointer's x.", { required: true, data: true }),
      prop("y", "number", "The pointer's y.", { required: true, data: true }),
    ],
    examples: [{ title: "Files", code: '<DragGhost text="3 files" x={pointer.x} y={pointer.y} />' }],
    replaces: [".drag-ghost in src/lib/views/files/FileExplorer.svelte"],
  },
];
