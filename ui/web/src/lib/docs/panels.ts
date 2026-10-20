import { prop, type ComponentDoc } from "./types";

const LABEL_COLUMN = '"small" | "medium" | "large"';

export const panelDocs: ComponentDoc[] = [
  {
    name: "PeekPanel",
    group: "Editor",
    summary: "A band set into an editor under a line, like VS Code's peek: a header with buttons, then content.",
    usage:
      "Put it in an editor's block widget, such as the change peek under a changed line. Name what it shows in " +
      "`title` and `detail`, put compact IconButtons in `actions`, and the content (a DiffFrame) in `children`; " +
      "it fills the set height. `tone` colors the lines above and below like the change.",
    aliases: ["Peek", "Inline panel", "Quick diff"],
    props: [
      prop("label", "string", "Accessible name.", { required: true }),
      prop("title", "string", "The title, such as the file name.", { required: true, data: true }),
      prop("detail", "string | null", "Quieter text after the title, such as the counter.", {
        default: "null",
        data: true,
      }),
      prop("tone", '"added" | "modified" | "deleted" | "neutral"', "The lines' color, like the change.", {
        default: '"neutral"',
      }),
      prop("height", '"xsmall" | "small" | "medium" | "large" | "xlarge"', "The whole band's height.", {
        default: '"large"',
      }),
      prop("actions", "Snippet", "Buttons at the end of the header."),
      prop("onclose", "() => void", "Escape inside the panel."),
      prop("children", "Snippet", "The content, filling the rest.", { required: true }),
    ],
    examples: [
      {
        title: "A change",
        code: '<PeekPanel label="Change" title="cart.ts" detail="2 of 4 changes" tone="added">...</PeekPanel>',
      },
    ],
    replaces: [],
  },
  {
    name: "RichEditorHost",
    group: "Editor",
    summary: "The page a rich Markdown editor (TipTap) is mounted into, in the preview's typography.",
    usage: "Create the editor on the element given to `onready`. Show loading in `status`, read-only in `notice`.",
    aliases: ["Rich editor", "WYSIWYG"],
    props: [
      prop("label", "string", "Accessible name.", { required: true }),
      prop("status", "string", "A line while it loads or fails.", { default: '""' }),
      prop("notice", "string", "A warning, such as why the file is read-only.", { default: '""' }),
      prop("onready", "(element: HTMLDivElement) => void", "The element to mount the editor on.", {
        required: true,
      }),
      prop("variant", '"editor" | "preview"', "The rich editor's page, or the read-only preview's (no editor rules).", {
        default: '"editor"',
      }),
      prop("page", "HTMLDivElement | null", "The scrolling page, to keep its scroll or focus it while read-only.", {
        default: "null",
        bindable: true,
      }),
      prop("onclick", "(event: MouseEvent) => void", "A click in the page, such as on a link."),
      prop("onkeydown", "(event: KeyboardEvent) => void", "A key in the page, such as Cmd+S."),
      prop("onauxclick", "(event: MouseEvent) => void", "A middle click in the page, such as on a link."),
      prop("onscroll", "(event: Event) => void", "The page scrolled, such as to scroll the source with it."),
    ],
    examples: [{ title: "Rich", code: '<RichEditorHost label="README.md" onready={(element) => mount(element)} />' }],
    replaces: ["src/lib/views/files/RichMarkdownView.svelte frame and styles"],
  },
  {
    name: "FloatingFindBar",
    group: "Editor",
    summary: "A find bar floating over a view that is not an editor, such as the terminal.",
    usage: "Use over terminals and previews. The editor's own find bar (with replace) is FindBar.",
    aliases: ["Find", "Search box"],
    props: [
      prop("query", "string", "What to find.", { default: '""', bindable: true }),
      prop("options", "SearchOptions", "Match case, whole words, regex.", {
        default: "all off",
        bindable: true,
      }),
      prop("counter", "string", "Such as 2 of 5.", { default: '""', data: true }),
      prop("problem", "boolean", "No match or a bad regex: tints it red.", { default: "false" }),
      prop("label", "string", "Accessible name.", { default: '"Find"' }),
      prop("element", "HTMLInputElement | null", "The field, for focus.", { default: "null", bindable: true }),
      prop("onsearch", "(query: string, options: SearchOptions) => void", "The query or options changed."),
      prop("onnext", "() => void", "Enter or the down button."),
      prop("onprevious", "() => void", "Shift+Enter or the up button."),
      prop("onclose", "() => void", "Esc or the close button."),
      prop("onkeydown", "(event: KeyboardEvent) => void", "Runs instead of the bar's own Enter and Esc."),
      prop("titles", 'Partial<Record<"previous" | "next" | "close", string>>', "Tooltips, with their keys.", {
        default: "{}",
      }),
      prop("toggleTitles", "Partial<Record<keyof SearchOptions, string>>", "Tooltips of the toggles.", {
        default: "{}",
      }),
    ],
    examples: [
      {
        title: "Terminal",
        code: "<FloatingFindBar bind:query counter={counter} onnext={next} onclose={close} />",
      },
    ],
    replaces: ["src/lib/terminal/TerminalFindBar.svelte"],
  },
];
