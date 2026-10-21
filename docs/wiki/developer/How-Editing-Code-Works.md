# How editing code works

This chapter covers what happens inside a CodeMirror editor once a file is open: the Edit and Code menu commands and their keys, multiple cursors, Go to Line. How code looks (line spacing, render whitespace, the current line, indentation, zoom) is in [How code appearance works](How-Code-Appearance-Works.md). Tabs, loading and saving are in [How the editor works](How-the-Editor-Works.md); completion, folding, guides and the languages are in [How Editor Features Work](How-Editor-Features-Work.md). The user side is in [Editing Code](../usage/Editing-Code.md).

## Why we need it

People move between Nibtree and their IDE all day. If Cmd+/ comments a line there, it must comment a line here too, and the menu bar should list the commands so they can be found. The keys follow the conventions most code editors share, and the macOS ones where they differ.

## How it works

### One key table for the editor and the menu

`EDITOR_SHORTCUTS` in `src/lib/editor/editorShortcuts.ts` lists every Edit and Code menu command with its key in CodeMirror notation (`Mod-Shift-d`) and where it is bound:

- `default`: CodeMirror's `defaultKeymap` already binds it (Cmd+/, Shift+Cmd+K, Option+Up, Cmd+]).
- `find`: the find bar's `findKeymap` (see [How find and replace works](How-Find-and-Replace-Works.md)).
- `code`: our own `codeKeymap` in `editorCommands.ts`, listed before the default keymap so Shift+Cmd+U is Toggle Case rather than CodeMirror's Redo Selection.

`menuSpec.ts` builds the Edit and Code menus from the same table with `acceleratorFor`, so a menu always shows the key the editor really binds.

```mermaid
flowchart TD
  Key["Key press"] --> Page{"Focused editor binds it?"}
  Page -->|"yes"| Run["Command runs in the editor"]
  Page -->|"no"| Menu["macOS passes it to the menu"]
  Click["Menu item clicked"] --> Action["runMenuAction"]
  Menu --> Action
  Action --> Editor["runEditorCommand: focusedEditor()"]
  Editor -->|"an editor has focus"| Run
  Editor -->|"none"| Nothing["Nothing happens"]
```

macOS gives a key to the web view first and only hands it to the menu when the page leaves it alone, so a key and its menu item never both run. A menu click goes through `runMenuAction`, which calls `runEditorCommand`: it finds the CodeMirror view that holds the focus (`focusedEditor`) and runs the entry from `EDITOR_COMMANDS`. Entries marked `inText` need the caret in the text; Find and friends also work from the find bar's fields.

`editorFocus` (`menu/editorFocus.svelte.ts`) follows `focusin` and `focusout` only, so typing costs nothing. `menuState.ts` uses it: the editing commands need a focused, writable editor; folding, Go to Line and Select Next Occurrence only a focused one. The menu routing in general is in [How the menus work](How-the-Menus-Work.md).

### The commands

Most commands are CodeMirror's own (`toggleComment`, `deleteLine`, `moveLineUp`, `foldCode`...). The ones it lacks live in `textCommands.ts` as pure functions from an `EditorState` to a transaction spec, so they are tested without a view:

- `duplicateSelection`: a selection is copied after itself, a caret copies its line below.
- `joinLines`: the break and the indentation around it become one space, none next to a blank line.
- `toggleCase`: upper case when the text has a lower case letter, otherwise lower case; a caret works on its word.
- `sortLines`: the selected lines, or the whole file, by character code so the order never depends on the system language.
- `parseLineTarget` and `lineTargetPosition` for Go to Line, which asks through `dialogs.prompt` ("Line[:column]") and checks that the editor still exists when the dialog closes.

`baseExtensions` in `setup.ts` turns on `allowMultipleSelections` and makes Option+Shift+click add a cursor (`clickAddsSelectionRange`), so Cmd+D and Select All Occurrences can leave many carets.

## Where the code lives

| File | What it does |
| --- | --- |
| `src/lib/editor/editorShortcuts.ts` | The key of every Edit and Code command, `acceleratorFor` |
| `src/lib/editor/editorCommands.ts` | `EDITOR_COMMANDS`, `codeKeymap`, `focusedEditor`, `runEditorCommand`, Go to Line |
| `src/lib/editor/textCommands.ts` | Duplicate, Join Lines, Toggle Case, Sort Lines, line targets |
| `src/lib/editor/setup.ts` | `editorTheme` and `baseExtensions` |
| `src/lib/menu/menuSpec.ts`, `menuActions.ts`, `menuState.ts` | The Edit and Code menus, their routing and enabling |
| `src/lib/menu/editorFocus.svelte.ts` | Which editor has the focus |

## Design decisions

**One table, two users.** The editor keymaps and the menu accelerators come from `EDITOR_SHORTCUTS`, and a test checks that each key is bound to the menu item's own command. A menu can never show a key that does something else.

**Editor keys where they clash.** Cmd+D adds the next occurrence, so Duplicate takes Shift+Cmd+D. Cmd+L is Go to Line (CodeMirror's select line is Ctrl+L on macOS and stays). The fold keys use Option+Cmd+] and [ because Cmd+= and Cmd+- stay with zoom.

## Tests

- `src/lib/editor/editorShortcuts.test.ts`: accelerators, every key bound to its command, no key used twice.
- `src/lib/editor/textCommands.test.ts`: Duplicate, Join Lines, Toggle Case, Sort Lines and Go to Line input.
- `src/lib/menu/menuSpec.test.ts` and `menuState.test.ts`: the menu items, keys and enabled states.

## Keeping this page in sync

- A new editor command: add it to `EditorAction`, `EDITOR_SHORTCUTS`, `EDITOR_COMMANDS` and the Code menu, then update [Editing Code](../usage/Editing-Code.md) and [Keyboard Shortcuts](../usage/Keyboard-Shortcuts.md).

## Bugs we fixed

None on this page yet. The selection hidden by the current line highlight is in [How code appearance works](How-Code-Appearance-Works.md#bugs-we-fixed) and [Editor Bugs We Fixed](Editor-Bugs-We-Fixed.md).
