import { prop, type ComponentDoc } from "./types";

export const shellDocs: ComponentDoc[] = [
  {
    name: "SplitPane",
    group: "Layout",
    summary: "Two panes side by side or stacked, with a ResizeHandle between; `size` is one pane's px.",
    usage: "Use for a sidebar and an editor, or an editor and a bottom panel. Save `size` in oncommit.",
    aliases: ["Resizable", "Splitter"],
    props: [
      prop("direction", '"row" | "column"', "Side by side or one above the other.", { default: '"row"' }),
      prop("size", "number", "The sized pane's width (row) or height (column) in px, as the user dragged it.", {
        required: true,
        bindable: true,
        data: true,
      }),
      prop("sized", '"first" | "second"', "Which pane `size` is: second for a list on the right.", {
        default: '"first"',
      }),
      prop("preset", '"sidebar" | "bottom" | "list" | "pane" | "files"', "The smallest and default size.", {
        default: '"pane"',
      }),
      prop("max", "number", "Largest size, from the window's room.", { default: "800", data: true }),
      prop("label", "string", "Accessible name of the handle, e.g. `Resize the sidebar`.", { required: true }),
      prop("extent", "number", "Its own measured width (row) or height (column), so the app can work out `max`.", {
        default: "0",
        bindable: true,
        data: true,
      }),
      prop("inPanel", "boolean", "Between views inside one panel: the handle keeps its size in rounded looks.", {
        default: "false",
      }),
      prop("oncommit", "(size: number) => void", "Called once when a drag or key press ends, to save the size.", {
        data: true,
      }),
      prop("first", "Snippet", "The first pane.", { required: true }),
      prop("second", "Snippet", "The second pane; leave it out to show the first alone, still mounted."),
    ],
    examples: [
      {
        title: "Sidebar",
        code:
          '<SplitPane label="Resize the sidebar" bind:size>\n  {#snippet first()}<Files />{/snippet}\n' +
          "  {#snippet second()}<Editor />{/snippet}\n</SplitPane>",
      },
    ],
    logic: ["resize.ts"],
    replaces: ["Workspace.svelte's sidebar and editor columns with a ResizeHandle"],
  },
  {
    name: "ResizeHandle",
    group: "Layout",
    summary: "A drag handle on a panel's edge: a line that becomes an accent bar on hover; keys and double-click.",
    usage: "Use beside a panel whose size the parent keeps. SplitPane wraps it for the common two-pane case.",
    aliases: ["Resizable handle"],
    props: [
      prop("size", "number", "The panel's current width, or height for the bottom side.", {
        required: true,
        data: true,
      }),
      prop("side", '"left" | "right" | "top" | "bottom"', "Where the panel is, relative to the handle.", {
        required: true,
      }),
      prop("preset", '"sidebar" | "bottom" | "list" | "pane" | "files"', "The smallest and default size.", {
        required: true,
      }),
      prop("max", "number", "Largest size, from the window's room.", { required: true, data: true }),
      prop("min", "number | null", "Smallest size when the layout decides it, instead of the preset's.", {
        default: "null",
        data: true,
      }),
      prop("defaultSize", "number | null", "Size a double-click resets to when the layout decides it, such as " +
        "half of a split.", { default: "null", data: true }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("inPanel", "boolean", "Between views inside one panel (editor groups): keeps its size in rounded looks.", {
        default: "false",
      }),
      prop("onresize", "(size: number) => void", "The new size while dragging or on a key.", {
        required: true,
        data: true,
      }),
      prop("oncommit", "(size: number) => void", "Called once when it ends, to save the size.", { data: true }),
    ],
    examples: [
      {
        title: "Left panel",
        code: '<ResizeHandle {size} side="left" preset="sidebar" max={600} label="Resize Files"\n' +
          "  onresize={(next) => (size = next)} oncommit={save} />",
      },
    ],
    logic: ["resize.ts"],
    replaces: ["src/lib/ui/ResizeHandle.svelte (panel becomes side, onResize becomes onresize)"],
  },
  {
    name: "StatusBar",
    group: "Layout",
    summary: "The bottom status bar: StatusItems on the left (repository, branch) and on the right.",
    usage: "Use once per window at the bottom. Put StatusItems in `start` and `end`.",
    props: [
      prop("label", "string", "Accessible name.", { default: '"Status bar"' }),
      prop("look", '"flat" | "rounded"', "A line on top, or the window frame's color (rounded panels).", {
        default: '"flat"',
      }),
      prop("start", "Snippet", "Items on the left; they clip when the window is narrow."),
      prop("end", "Snippet", "Items on the right."),
    ],
    examples: [
      {
        title: "Branch and memory",
        code:
          "<StatusBar>\n  {#snippet start()}<StatusItem icon=\"branch\" text=\"main\" onclick={pick} />{/snippet}\n" +
          '  {#snippet end()}<StatusItem icon="memory" text="181 MB" />{/snippet}\n</StatusBar>',
      },
    ],
    replaces: ['<footer class="status-bar"> in StatusBar.svelte'],
  },
  {
    name: "StatusItem",
    group: "Layout",
    summary: "One status bar item: an icon and short text; a button when it has `onclick`.",
    usage: "Use inside StatusBar. Keep the text to a word or two; put details in a Popover.",
    props: [
      prop("text", "string", "Short text after the icon.", { default: '""' }),
      prop("leading", "Snippet", "Before the icon, such as a Mark and a mini Meter (AI usage)."),
      prop("trailing", "Snippet", "After the text, such as a small Badge (notifications) or a StatusDot."),
      prop("icon", "IconName | null", "The icon.", { default: "null" }),
      prop("label", "string", "Accessible name when the text alone is not enough."),
      prop("title", "string", "Tooltip."),
      prop("tone", '"default" | "accent" | "warning" | "danger"', "Color, e.g. danger for conflicts.", {
        default: '"default"',
      }),
      prop("spin", "boolean", "The icon turns, while work runs.", { default: "false" }),
      prop("variant", '"default" | "quiet"', "Quiet: 11px dim words, like Keep Awake.", { default: '"default"' }),
      prop("active", "boolean", "A quiet item that is on: its words brighten.", { default: "false" }),
      prop("disabled", "boolean", "Cannot be pressed now, such as Sync while another job runs.", { default: "false" }),
      prop("limit", '"none" | "branch" | "operation"', "Truncate the text at 200 or 320 px.", { default: '"none"' }),
      prop("open", "boolean", "Highlighted while its popover shows.", { default: "false" }),
      prop("onclick", "(event: MouseEvent) => void", "Makes it a button."),
    ],
    examples: [{ title: "Branch", code: '<StatusItem icon="branch" text="main" onclick={openBranches} />' }],
    replaces: ['<button class="item"> in StatusBar.svelte'],
  },
  {
    name: "ActivityBar",
    group: "Layout",
    summary: "The vertical icon bar beside a side panel; the open panel is tinted with an accent line.",
    usage:
      "Use at the window's left or right edge. A `null` item pushes the rest to the bottom; \"divider\" draws a " +
      "short line between groups. Give an item `active` when it is on by itself (the Log, the terminal). With " +
      "`movable`, icons drag between both bars' top and bottom groups: keep the places in an ActivityLayout " +
      "(logic/activityLayout.ts) and apply `onmove` with `moveActivity`; offer the same moves in `oncontextmenu`.",
    aliases: ["Sidebar"],
    props: [
      prop(
        "items",
        "({ id; icon; label; badge?: number; badgeTone?: \"accent\" | \"danger\" | \"warning\"; dot?: boolean; " +
          "smallIcon?: boolean; active?: boolean; title?: string } | null | \"divider\")[]",
        "The panels; `title` is the tooltip, such as the name with its shortcut.",
        { required: true, data: true },
      ),
      prop("active", "string | null", "The open panel's id.", { default: "null", bindable: true }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("side", '"left" | "right"', "Which window edge; moves the border and accent line.", {
        default: '"left"',
      }),
      prop("movable", "boolean", "Icons can be dragged to another place in either bar; a line shows where.", {
        default: "false",
      }),
      prop("onselect", "(id: string) => void", "A panel button was clicked."),
      prop(
        "onmove",
        "(id: string, target: { slot: " +
          '"left-top" | "left-bottom" | "right-top" | "right-bottom"; index: number }) => void',
        "A dragged icon was dropped: the group and the place in it (the bar it came from calls it).",
      ),
      prop("oncontextmenu", "(id: string, event: MouseEvent) => void", "An icon was right-clicked, for a menu."),
    ],
    examples: [
      { title: "Left bar", code: '<ActivityBar label="Side panels" {items} bind:active />' },
      {
        title: "Movable",
        code:
          '<ActivityBar label="Side panels" items={barItems(layout, "left")} movable\n' +
          "  onmove={(id, target) => (layout = moveActivity(layout, id, target.slot, target.index))} />",
      },
    ],
    replaces: ['<nav class="activity"> in ActivityBar.svelte and RightActivityBar.svelte'],
  },
];
