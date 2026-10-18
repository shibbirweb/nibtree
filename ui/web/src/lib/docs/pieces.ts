import { prop, type ComponentDoc } from "./types";

const RESULT_KIND = '"file" | "line" | "symbol" | "item" | "section" | "more"';

export const pieceDocs: ComponentDoc[] = [
  {
    name: "PatchView",
    group: "Editor",
    summary: "A patch in monospace with added and removed lines tinted, hunk headers in the accent color.",
    usage:
      "Use to show git diff output read-only, such as one commit's change to a line range. For a real diff use " +
      "DiffView.",
    aliases: ["Patch", "Unified diff"],
    props: [
      prop("patch", "string", "git diff output.", { default: '""', data: true }),
      prop("lines", "PatchLine[] | null ({ kind; text })", "Lines already split, instead of `patch`.", {
        default: "null",
        data: true,
      }),
      prop("note", "string", "A last hunk-styled line, such as the patch being cut short.", { default: '""' }),
      prop("label", "string", "Accessible name.", { required: true }),
    ],
    examples: [{ title: "A change", code: '<PatchView label="Patch" patch={diffText} />' }],
    logic: ["patchLines.ts"],
    replaces: [".patch in src/lib/views/git/LineHistoryTab.svelte"],
  },
  {
    name: "AppHeader",
    group: "Layout",
    summary: "The bar across the top of the window: navigation and pickers on the left, busy work and actions right.",
    usage:
      "Use once, as AppShell's header. Put history buttons, a vertical Divider and the folder, repository and " +
      "branch pickers (Button ghost with trailingIcon) in `start`; set `busy` while an operation runs.",
    aliases: ["Header", "Title bar", "Top bar"],
    props: [
      prop("busy", "string", "What is running; shows a spinner with it.", { default: '""' }),
      prop("busyTitle", "string", "A longer tooltip for the busy text."),
      prop("look", '"flat" | "rounded"', "A line under it, or the window frame's color with rounded panels.", {
        default: '"flat"',
      }),
      prop("tint", '"none" | "blue" | "green" | "magenta" | "cyan" | "red"', "Flat look: the rounded look's " +
        "glow from the top left corner in the open project's color (its Welcome tile), on the bar itself; the " +
        "rounded look shows AppShell's.", {
        default: '"none"',
      }),
      prop("windowControls", "boolean", "The window's own buttons sit at its left (macOS without a title strip): " +
        "leaves room for them and lets the bar's empty space move the window.", { default: "false" }),
      prop("menuBar", "Snippet", "A MenuBar (surface \"none\") in a row above, inside the same background and " +
        "glow: an app without a system menu bar, such as in a browser tab."),
      prop("start", "Snippet", "Left side; shrinks and truncates first.", { required: true }),
      prop("end", "Snippet", "Right side actions."),
    ],
    examples: [{ title: "Window", code: "<AppHeader busy={progress} {start} {end} />" }],
    replaces: ["src/lib/views/Header.svelte layout"],
  },
  {
    name: "SymbolBadge",
    group: "Feedback",
    summary: "A one-letter badge for a code symbol's kind, in the syntax color of its group.",
    usage: "Use before symbols in search results.",
    aliases: ["Symbol kind"],
    props: [
      prop("letter", "string", "C, I, F, K...", { required: true, data: true }),
      prop("tone", '"type" | "interface" | "function" | "constant"', "The group's syntax color.", { required: true }),
      prop("title", "string", "The kind's name, such as Class."),
    ],
    examples: [{ title: "Class", code: '<SymbolBadge letter="C" tone="type" title="Class" />' }],
    replaces: [".badge in SymbolResult.svelte and QuickOpen.svelte"],
  },
  {
    name: "TreeLine",
    group: "Layout",
    summary: "The connector in front of a grouped row, like split terminals in the terminal list.",
    usage: "Put it first in each row of a group: first, middle and last.",
    aliases: ["Connector", "Tree guide"],
    props: [prop("position", '"first" | "middle" | "last"', "The row's place in its group.", { required: true })],
    examples: [{ title: "Group", code: '<TreeLine position="first" />' }],
    replaces: [".tree in src/lib/terminal/TerminalPanel.svelte"],
  },
];
