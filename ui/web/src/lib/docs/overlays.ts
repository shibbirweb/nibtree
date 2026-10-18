import { prop, type ComponentDoc } from "./types";

const MENU_ITEM = "MenuItem (MenuCommand | MenuSubmenu | MenuSeparator, from logic/menuModel.ts)";

export const overlayDocs: ComponentDoc[] = [
  {
    name: "Dialog",
    group: "Overlays",
    summary: "A modal dialog over a dimmed window: a title, the content and the actions on the right.",
    usage:
      "Use for tasks that need a few inputs, such as New Branch. " +
      "Use the `message` variant for a yes or no question. " +
      "Keep one Primary button in `actions`, last.",
    aliases: ["Dialog", "Modal"],
    props: [
      prop("open", "boolean", "Shown or hidden.", { default: "false", bindable: true }),
      prop("title", "string", "The heading; also the dialog's accessible name.", { required: true }),
      prop("variant", '"message" | "form" | "split" | "panel" | "view"', "A question and buttons, the Git dialogs' " +
        "form, Settings' side column and content, a large panel with a scrolling body (Shortcuts, What's New), or a " +
        "tall centered box whose body is one view without padding (Local History: a list beside a diff).", {
        default: '"message"',
      }),
      prop("width", '"small" | "normal" | "medium" | "large" | "xlarge" | "full"', "460, 520, 560, 620, 760 or " +
        "1200 px; split dialogs have their own size.", {
        default: "small (message), normal (form), large (panel), full (view)",
      }),
      prop("dismissible", "boolean", "Esc and a click on the dim area close it.", { default: "true" }),
      prop(
        "urgent",
        "boolean",
        "A question a running command waits on, such as a git sign-in: it shows over every other dialog and keeps " +
          "its keys from the window's shortcuts.",
        { default: "false" },
      ),
      prop("movable", "boolean", "Drag the title to move it; double-click the title centers it.", { default: "false" }),
      prop("subtitle", "string", "A dim line under the title.", { default: '""' }),
      prop("icon", "IconName | null", "An icon on a tinted tile before the title.", { default: "null" }),
      prop("iconTone", '"accent" | "success" | "warning" | "danger"', "The tile's color.", { default: '"accent"' }),
      prop("toolbar", "Snippet", "A bar under the head, such as a Toolbar with a filter (panel dialogs)."),
      prop("footnote", "Snippet", "Content at the footer's start, such as a Link or a hint."),
      prop("onclose", "() => void", "Called when the user dismisses it (Esc or outside click)."),
      prop("onsubmit", "() => void", "Cmd+Enter (Ctrl+Enter): the main action of a form."),
      prop("enterSubmits", "boolean", "A plain Enter in a one-line field submits too, like a one-field prompt or " +
        "a password; Enter in a text area or on a button does not.", { default: "false" }),
      prop("actions", "Snippet", "Buttons on the right under the content."),
      prop("sidebar", "Snippet", "The side column of a split dialog, such as a SideNav."),
      prop("contentTitle", "string", "Split: a head over the content, such as the open section's name, with a " +
        "close button; with movable it drags the dialog too.", { default: '""' }),
      prop("children", "Snippet", "The content.", { required: true }),
    ],
    examples: [
      {
        title: "New Branch",
        code:
          '<Dialog bind:open title="New Branch">\n  <Field label="Name"><Input bind:value={name} /></Field>\n' +
          '  {#snippet actions()}\n    <Button onclick={() => (open = false)}>Cancel</Button>\n' +
          '    <Button variant="primary" onclick={create}>Create</Button>\n  {/snippet}\n</Dialog>',
      },
      {
        title: "A prompt that Enter submits",
        code:
          '<Dialog bind:open title="Password" onsubmit={send} enterSubmits>\n' +
          '  <Input type="password" bind:value={password} />\n' +
          '  {#snippet actions()}<Button variant="primary" onclick={send}>OK</Button>{/snippet}\n</Dialog>',
      },
    ],
    logic: ["dialogKeys.ts"],
    replaces: [
      '<div class="overlay"><div class="dialog" role="dialog">...</div></div>',
      "Git menu dialogs",
      '<form onsubmit> around a prompt\'s field (Enter submits)',
    ],
    rules: ["Focus goes into the dialog when it opens and back when it closes; do not move it by hand."],
  },
  {
    name: "Popover",
    group: "Overlays",
    summary: "A panel anchored to its trigger, like the AI usage panel; Esc or an outside click closes it.",
    usage: "Use for details or a few choices next to a control. Use Menu for a list of commands.",
    aliases: ["Popover", "Dropdown panel"],
    props: [
      prop("open", "boolean", "Shown or hidden.", { default: "false", bindable: true }),
      prop("label", "string", "Accessible name of the panel.", { required: true }),
      prop("placement", '"above" | "below"', "Which side of the trigger; above in the status bar.", {
        default: '"below"',
      }),
      prop("align", '"start" | "end"', "Which edge of the trigger it lines up with.", { default: '"start"' }),
      prop("width", '"auto" | "small" | "medium" | "large"', "Fits the content, or 256, 300 or 360 px.", {
        default: '"auto"',
      }),
      prop("padding", '"menu" | "panel" | "form"', "4px for menu-like lists, 12 by 14px for detail panels, 12px " +
        "and a column of fields for a small form (Commit Options).", {
        default: '"menu"',
      }),
      prop("textSize", '"normal" | "small"', "Small (12px) for the status bar's popovers.", { default: '"normal"' }),
      prop("layer", '"anchor" | "window"', "Under its trigger in the page, or floating over the window and kept " +
        "inside it, so a scrolling or narrow panel cannot cut it off (Commit Options).", { default: '"anchor"' }),
      prop("autofocus", "boolean", "Its first field takes the focus when it opens, and Esc gives the focus back " +
        "to the trigger, for a small form.", { default: "false" }),
      prop("trigger", "Snippet<[{ toggle: () => void; open: boolean }]>", "The button that opens it.", {
        required: true,
      }),
      prop("children", "Snippet", "The panel's content.", { required: true }),
    ],
    examples: [
      {
        title: "Status bar details",
        code:
          '<Popover label="AI usage" placement="above" align="end">\n' +
          "  {#snippet trigger({ toggle, open })}\n" +
          '    <IconButton icon="bot" label="AI usage" active={open} onclick={toggle} />\n' +
          "  {/snippet}\n  ...\n</Popover>",
      },
    ],
    replaces: [
      '<div class="details" role="dialog"> in StatusBar',
      '<div class="menu"> in KeepAwake and AiUsage',
      '<div class="panel" role="dialog"> with its fixed place in CommitOptionsPopover.svelte',
    ],
    logic: ["popoverPlace.ts"],
  },
  {
    name: "Menu",
    group: "Overlays",
    summary: "A context or drop-down menu at a point, with hints, separators and submenus; keyboard friendly.",
    usage:
      "Open it from oncontextmenu with the event's x and y, and render it while open. Use MenuButton for a " +
      'button that opens a menu. Item shapes match the app\'s contextMenu items.',
    aliases: ["Context menu", "Dropdown menu"],
    props: [
      prop("items", `${MENU_ITEM}[]`, "The entries.", { required: true }),
      prop("x", "number", "Left edge (or right edge with alignEnd), viewport px.", { required: true, data: true }),
      prop("y", "number", "Top edge, viewport px; it moves up when it would not fit.", { required: true, data: true }),
      prop("alignEnd", "boolean", "Line up the menu's right edge with x.", { default: "false" }),
      prop("keyboard", "boolean", "Highlight the first item at once (opened with the keyboard).", { default: "false" }),
      prop("label", "string", "Accessible name.", { default: '"Menu"' }),
      prop("onclose", "(restoreFocus: boolean) => void", "Close it; restoreFocus is true after Esc or a command.", {
        required: true,
      }),
      prop("onstep", "(step: 1 | -1) => void", "Left and Right go here instead of closing (MenuBar's next menu)."),
    ],
    examples: [
      {
        title: "Context menu",
        code:
          "<div oncontextmenu={(event) => {\n  event.preventDefault();\n" +
          "  at = { x: event.clientX, y: event.clientY };\n}}>\n" +
          "{#if at}<Menu {items} x={at.x} y={at.y} onclose={() => (at = null)} />{/if}",
      },
    ],
    logic: ["menuModel.ts"],
    replaces: ["contextMenu.open(event, items) and ContextMenuHost.svelte"],
    rules: [
      "Shortcut hints come from commandKeys(id), never typed by hand.",
      "A command with `checked` is a check item; the menu then lines up every label after the mark's room.",
    ],
  },
  {
    name: "MenuBar",
    group: "Overlays",
    summary: "A bar of menus under their names, like a window's File, Edit and View.",
    usage:
      "Use where the system has no menu bar for the app, such as the app in a browser tab. Each menu holds Menu " +
      "items. Pointing at another name while a menu is open opens that one; Left and Right move along the bar.",
    aliases: ["Menubar", "Application menu", "Main menu"],
    props: [
      prop("menus", "MenuBarMenu[] ({ label, items }, from logic/menuBarModel.ts)", "The menus, left to right.", {
        required: true,
      }),
      prop("label", "string", "Accessible name.", { default: '"Menu bar"' }),
      prop("surface", '"panel" | "none"', "Its own panel background with a line under it, or none inside " +
        "AppHeader's menuBar row, where the header's background and glow show through.", { default: '"panel"' }),
    ],
    examples: [
      {
        title: "File and Edit",
        code:
          '<MenuBar menus={[\n  { label: "File", items: [{ label: "Open...", action: openFolder }] },\n' +
          '  { label: "Edit", items: [{ label: "Word Wrap", action: toggleWrap, checked: wrap }] },\n]} />',
      },
    ],
    logic: ["menuBarModel.ts", "menuModel.ts"],
    replaces: ["the native menu bar in the browser app (src/lib/menu/PageMenuBar.svelte)"],
    rules: ["Shortcut hints come from commandKeys(id) or localKeys(accelerator), never typed by hand."],
  },
  {
    name: "MenuButton",
    group: "Overlays",
    summary: 'A button that opens a Menu under itself, like a "..." button.',
    usage: "Use for a short list of actions behind one button. With `text` it is a Button, otherwise an IconButton.",
    aliases: ["Dropdown menu"],
    props: [
      prop("items", `${MENU_ITEM}[]`, "The entries.", { required: true }),
      prop("label", "string", "Accessible name and tooltip.", { required: true }),
      prop("icon", "IconName", "The icon.", { default: '"more"' }),
      prop("text", "string", "Show a text button instead of an icon button.", { default: '""' }),
      prop("alignEnd", "boolean", "Line up the menu's right edge with the button's.", { default: "false" }),
      prop("disabled", "boolean", "Disables the button.", { default: "false" }),
    ],
    examples: [{ title: "More actions", code: '<MenuButton label="More actions" items={actions} alignEnd />' }],
    logic: ["menuModel.ts"],
    replaces: ["contextMenu.openBelow(button, items)"],
  },
  {
    name: "ToastHost",
    group: "Overlays",
    summary:
      "Draws toasts as Notification balloons in the bottom right corner, above the status bar and beside the right " +
      "activity bar.",
    usage:
      "Render one per window with a store's items. The library's createToasts() is a simple store; the app's " +
      "toast store also records the notification history and renders through ToastHost the same way.",
    aliases: ["Toast", "Sonner", "Snackbar", "Balloon"],
    props: [
      prop("items", "ToastItem[] (logic/toastModel.ts)", "The toasts to show, oldest first.", { required: true }),
      prop("ondismiss", "(id: number) => void", "Close one (the x button).", { required: true, data: true }),
      prop("onaction", "(id: number) => void", "Run a toast's link, then close it.", { data: true }),
      prop("onhold", "(id: number, held: boolean) => void", "The pointer is over a toast (true) or left it, so " +
        "the store keeps it while it is read.", { data: true }),
    ],
    rules: ["Keep a toast open while the pointer is over it: pass the store's hold to `onhold`."],
    examples: [
      {
        title: "With the library store",
        code:
          "const toasts = createToasts();\n" +
          "<ToastHost items={toasts.items} ondismiss={toasts.dismiss} onaction={toasts.runAction}\n" +
          "  onhold={toasts.hold} />",
      },
    ],
    logic: ["toastModel.ts"],
    replaces: ["Toasts.svelte (the store stays toast.svelte.ts)"],
  },
  {
    name: "WindowLayer",
    group: "Overlays",
    summary: "A modal page over the whole window, with no dimming or frame; its content fills it as a column.",
    usage:
      "Use for a tool that takes the whole window for a while, such as the merge tool: a Toolbar with its title " +
      "and a close button, then the view. The content handles Esc, so leaving can ask first.",
    aliases: ["Full-screen overlay", "Modal page"],
    props: [
      prop("label", "string", "Accessible name, such as the file being merged.", { required: true }),
      prop("children", "Snippet", "A Toolbar and a growing view.", { required: true }),
    ],
    rules: ["Give the content its own close button: there is no dim area to click and Esc is the content's."],
    examples: [
      {
        title: "The merge tool",
        code:
          '<WindowLayer label="Merge src/app.ts">\n' +
          '  <Toolbar variant="tab" label="Merge">...</Toolbar>\n' +
          "  <MergeEditor {doc} />\n" +
          "</WindowLayer>",
      },
    ],
    replaces: ['<div class="overlay" role="dialog"> covering the window in merge/MergeView.svelte'],
  },
];
