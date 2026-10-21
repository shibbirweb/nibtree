import { prop, type ComponentDoc } from "./types";

const ROW_SIZE = '"tree" | "list" | "history" | "entry" | "large" | "section" | "group"';
const ROW_HEIGHT = '"compact" | "normal" | "relaxed" | "comfortable" | null';
const VIEW_HEIGHT = '"auto" | "fill" | "small" | "medium" | "large" | "xlarge"';

export const builderDocs: ComponentDoc[] = [
  {
    name: "Row",
    group: "Layout",
    summary: "One row of a list: hover, selected color, fold chevron, indent and hover actions around your content.",
    usage:
      "Build every list row from it: put Icon, Text, Tag, StatusLetter and the like inside, and a Spacer before " +
      "what sits at the end. Pick the size for the place: tree (24 px, sidebars), list (24 px, file lists), " +
      "history (26 px, commit lists), entry (grows, 4 px above and below, dialogs), large (56 px, Welcome), " +
      "section (28 px, a repository's header) or group (24 px, lined up with a Collapsible's title, like the " +
      "repositories under No Changes). " +
      "Put Rows in a List for the keyboard and selection; alone, a Row with `onclick` is a button.",
    aliases: ["List item", "Item", "Row", "Cell"],
    props: [
      prop("size", ROW_SIZE, "Height, side padding and gap for the place it is used.", { default: '"list"' }),
      prop("selected", "boolean", "The selected row; stronger while its List has the focus.", { default: "false" }),
      prop("disabled", "boolean", "Faint and cannot be pressed.", { default: "false" }),
      prop("depth", "number", "Indent levels, for nested rows.", { default: "0", data: true }),
      prop("expanded", 'boolean | "leaf" | null', "A fold chevron; leaf keeps its room empty, null has none.", {
        default: "null",
      }),
      prop("align", '"center" | "baseline"', "Baseline for rows of words in two sizes.", { default: '"center"' }),
      prop("actionsShown", '"hover" | "always"', "Show `actions` on hover, focus and the selected row, or always.", {
        default: '"hover"',
      }),
      prop("line", "boolean", "A line under the row, for rows in a ListBox (the last one has none).", {
        default: "false",
      }),
      prop("mark", "boolean", "An accent stripe on its left edge, such as the active repository's header.", {
        default: "false",
      }),
      prop("cursor", '"default" | "pointer"', "The hand cursor, for rows that open something like a link (the " +
        "Welcome screen's projects).", { default: '"default"' }),
      prop("title", "string", "Tooltip, such as the full path."),
      prop("label", "string", "Accessible name, when the content alone does not say it."),
      prop("id", "string", "Its element id, so a list that keeps the focus elsewhere can point at it or scroll " +
        "to it.", {
        data: true,
      }),
      prop("item", '"option" | "treeitem" | null', "An item of a ListRegion that keeps the keys: its role and " +
        "selection for screen readers, and no tab stop; clicks still run onclick.", { default: "null" }),
      prop("actions", "Snippet", "Small buttons at the end; their clicks do not select the row."),
      prop("children", "Snippet", "The row's content.", { required: true }),
      prop("onclick", "(event: MouseEvent) => void", "Pressed (outside a List, this makes it a button)."),
      prop("ondblclick", "(event: MouseEvent) => void", "Double-clicked."),
      prop("oncontextmenu", "(event: MouseEvent) => void", "Right-clicked, for its Menu."),
      prop("onhover", "() => void", "The pointer moved over it, to move a highlight."),
    ],
    examples: [
      {
        title: "A commit in a history list",
        code:
          '<Row size="history" selected={id === selectedId}>\n' +
          '  <Stack width="xsmall"><Text mono tone="dim" size="compact">{hash}</Text></Stack>\n' +
          "  <Text truncate>{subject}</Text>\n" +
          "  <Spacer />\n" +
          '  <Text tone="dim" tabular>{when}</Text>\n' +
          "</Row>",
      },
      {
        title: "A folding row with hover actions",
        code:
          '<Row size="tree" expanded={open} depth={1}>\n' +
          '  <Icon name="stash" size="normal" />\n' +
          "  <Text truncate>{name}</Text>\n" +
          '  {#snippet actions()}<IconButton icon="trash" label="Delete" size="mini" />{/snippet}\n' +
          "</Row>",
      },
    ],
    replaces: [
      ".entry in FileHistoryTab, LineHistoryTab and ReflogTab",
      ".version and .deleted-row in LocalHistoryDialog",
      ".entry and .file in ShelfPanel",
      ".item in TerminalPanel, .row in ScriptsPanel and TerminalMemory",
      ".agent, .project and .card-head in AiPanel",
      ".commit in BranchCompareTab and PushDialog, .branch in BranchesPopup",
      ".row in GitConsoleView, .call in McpToolsDialog, .action in EmptyMain",
      ".project and .learn-item in Welcome",
    ],
    rules: [
      "Lay out the content with Text and Icon in the Row; use Stack grow for a column of two lines.",
      "Action buttons go in `actions`, never in the content, so they show on hover and keep the row's click.",
    ],
  },
  {
    name: "List",
    group: "Navigation",
    summary: "The keyboard and selection around Rows: a listbox, a tree or a plain list, optionally virtual.",
    usage:
      "Give it the items and a `row` snippet that draws a Row with the state it gets. Arrows, Home, End and " +
      "Page keys move, Enter or a double-click activates, Left and Right fold tree rows, `multiple` selects " +
      "several. `skip` names headings the keys pass over. `virtual` draws only the rows in view: give it the " +
      "Row's height (normal for tree and list rows, relaxed for history rows). A filter field drives it with " +
      "`field`: Down or Enter moves the focus in, or with `fieldKeys=\"drive\"` the field keeps the focus while " +
      "Up, Down and Enter work the list (Quick Open, Recent Files, the Branches popup). `focus()` takes the " +
      "focus and `reveal(key, place)` scrolls a row the app selected into view, to the middle with `center`.",
    aliases: ["Listbox", "Tree view", "Selectable list", "Virtual list"],
    props: [
      prop("items", "T[]", "Every row's item, headings included.", { required: true, data: true }),
      prop("itemKey", "(item: T) => string", "An item's id.", { required: true }),
      prop("label", "string", "Accessible name.", { required: true }),
      prop("role", '"listbox" | "tree" | "list"', "A pick list, a tree, or a plain list with no selection.", {
        default: '"listbox"',
      }),
      prop("selected", "string | null", "The current row's id.", { default: "null", bindable: true }),
      prop("selection", "string[]", "The selected rows' ids, with `multiple`.", { default: "[]", bindable: true }),
      prop("multiple", "boolean", "Cmd or Ctrl adds a row, Shift a range, Cmd+A all.", { default: "false" }),
      prop("skip", "(item: T) => boolean", "Rows that cannot be picked, such as group headings.", {
        default: "() => false",
      }),
      prop("level", "(item: T) => number", "A tree row's level, 0 at the top.", { default: "() => 0" }),
      prop("expanded", "(item: T) => boolean | null", "Whether a tree row is open; null for a leaf.", {
        default: "() => null",
      }),
      prop("height", VIEW_HEIGHT, "Its content's height, its parent's, or scroll past 160, 240, 360 or 468 px " +
        "(a palette's results).", {
        default: '"auto"',
      }),
      prop("virtual", ROW_HEIGHT, "Draw only the rows in view, each this tall (the estimate with `measure`).", {
        default: "null",
      }),
      prop("measure", "boolean", "Rows differ in height, like console entries that open: each drawn row is measured.", {
        default: "false",
      }),
      prop("field", "HTMLInputElement | null", "A filter field above it whose keys work the list.", {
        default: "null",
      }),
      prop("fieldKeys", '"enter" | "drive"', "Down or Enter in the field moves the focus in, or the field keeps " +
        "the focus while Up, Down, Page keys and Enter work the list; clicks keep the focus in the field.", {
        default: '"enter"',
      }),
      prop("follow", "boolean", "Stay at the bottom while entries arrive, until the user scrolls up (a console).", {
        default: "false",
      }),
      prop("row", "Snippet<[T, ListRowState]>", "Draws a row from its item and { index, selected, current }.", {
        required: true,
      }),
      prop("empty", "Snippet", "Shown when there are no items, such as an EmptyState."),
      prop("onselect", "(item: T) => void", "A row was selected by click or key."),
      prop("clickActivates", "boolean", "A click picks a row like Enter, not only selects it (search results).", {
        default: "false",
      }),
      prop("onactivate", "(item: T, event?: KeyInput | MouseEvent) => void", "Enter or a double-click on a row (a " +
        "click with clickActivates); the event tells whether Shift or Cmd was held."),
      prop("ontoggle", "(item: T, open: boolean) => void", "Left or Right asks to fold or unfold a tree row."),
      prop(
        "oncontextmenu",
        "(event: MouseEvent, item: T, fromKeys?: boolean) => void",
        "Right-clicked (the row is selected first), or the menu key or Shift+F10 on the current row: `fromKeys`, " +
          "with the event under the row's start.",
      ),
      prop(
        "onkeydown",
        "(event: KeyboardEvent, fromField: boolean) => void",
        "Runs first for a key in the list or its field; call preventDefault to keep the key from the list, " +
          "such as Delete removing a branch.",
      ),
      prop("onnearend", "() => void", "Scrolled near the end: load the next page (once per item count)."),
    ],
    logic: [
      "listKeys.ts",
      "listNav.ts",
      "listField.ts",
      "listScroll.ts",
      "listWiring.svelte.ts",
      "treeSelect.ts",
      "virtualWindow.ts",
      "rowOffsets.ts",
      "rowHeights.svelte.ts",
    ],
    examples: [
      {
        title: "Changed files",
        code:
          '<List label="Changed files" items={files} itemKey={(f) => f.path} bind:selected onactivate={open}>\n' +
          "  {#snippet row(file, state)}\n" +
          "    <Row selected={state.selected}>\n" +
          "      <StatusLetter kind={file.kind} /><Text truncate>{file.name}</Text>\n" +
          "    </Row>\n" +
          "  {/snippet}\n" +
          "</List>",
      },
      {
        title: "Driven from a filter field (Quick Open)",
        code:
          '<Input bind:element={filter} bind:value={query} aria-label="Search" />\n' +
          '<List label="Results" items={found} itemKey={(f) => f.path} field={filter} fieldKeys="drive"\n' +
          '  height="fill" virtual="normal" onactivate={open}>\n' +
          "  {#snippet row(file, state)}<Row selected={state.selected}><Text>{file.name}</Text></Row>{/snippet}\n" +
          "</List>",
      },
    ],
    replaces: [
      ".files in ChangesTab and BranchFileList, .list in FileHistoryTab, LineHistoryTab and ReflogTab",
      ".versions in LocalHistoryDialog, .tree in ScriptsPanel and Sidebar, .list in AiPanel and ShelfPanel",
      ".table in ConflictsDialog, .list in TerminalPanel, .list in GitConsoleView",
    ],
    rules: [
      "The List holds the focus; Rows inside take none and draw only their look.",
      "onnearend and follow need a list that scrolls itself: height fill, small, medium or large, or virtual.",
    ],
  },
  {
    name: "Spacer",
    group: "Layout",
    summary: "Takes the free room in a row, so what comes after it sits at the far end.",
    usage:
      "Use in a Row, a Toolbar or a row Stack: a title, a Spacer, then the buttons. With only two groups, " +
      'Stack\'s justify="between" does the same.',
    aliases: ["Spacer", "Flex fill"],
    props: [],
    examples: [
      {
        title: "Panel bar",
        code: '<Stack direction="row" align="center"><Text>Shelf</Text><Spacer /><Button>Shelve</Button></Stack>',
      },
    ],
    replaces: [".spacer in about 35 app files"],
  },
  {
    name: "Time",
    group: "Layout",
    summary: "A moment relative to now, kept current: 5 min ago, 5m, or in 3h 20m, with the full date as tooltip.",
    usage:
      "Use for commit dates, notification times, how long an agent has waited, and when usage resets. Put it in " +
      "a Text for tone and size. Live Times share one clock that ticks every 30 seconds only while one is shown; " +
      "turn `live` off in long static lists that never stay open for minutes.",
    aliases: ["Relative time", "Timestamp", "Time ago", "Countdown"],
    props: [
      prop("time", "number", "The moment, in milliseconds since 1970 (multiply git's seconds by 1000).", {
        required: true,
        data: true,
      }),
      prop("format", '"ago" | "age" | "until"', "5 min ago and yesterday (a date after a week), a short age " +
        "(5m, 2h), or a countdown (in 3h 20m, now when due).", { default: '"ago"' }),
      prop("live", "boolean", "Stays current from the shared clock.", { default: "true" }),
    ],
    logic: ["timeText.ts", "clock.svelte.ts"],
    examples: [
      {
        title: "A commit's date",
        code: '<Text tone="dim" size="small"><Time time={commit.time * 1000} /></Text>',
      },
      { title: "Usage resets", code: '<Text tone="dim">Resets <Time time={window.resetsAt} format="until" /></Text>' },
    ],
    replaces: [
      "relativeTime() with a now timer in LogView and NotificationBell; formatAge() in AiPanel",
      "resetIn() and updatedText() in AiUsage; relativeTime() in FileHistoryTab, LineHistoryTab, ReflogTab",
      "relativeTime() in BranchCompareTab, InteractiveRebaseDialog, LocalHistoryDialog and PushDialog",
    ],
    rules: ["Never write a relative time by hand or run a timer for one; use Time."],
  },
];
