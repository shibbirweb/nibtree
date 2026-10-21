# Menu

A context or drop-down menu at a point, with hints, separators and submenus; keyboard friendly.

```ts
import Menu from "@nibtree/ui/components/Menu.svelte";
```

Group: Overlays. Also known as: Context menu, Dropdown menu.

## When to use

Open it from oncontextmenu with the event's x and y, and render it while open. Use MenuButton for a button that opens a
menu. Item shapes match the app's contextMenu items.

## Props

- `items` (`MenuItem (MenuCommand | MenuSubmenu | MenuSeparator, from logic/menuModel.ts)[]`, required): The entries.
- `x` (`number`, required): Left edge (or right edge with alignEnd), viewport px.
- `y` (`number`, required): Top edge, viewport px; it moves up when it would not fit.
- `alignEnd` (`boolean`, default `false`): Line up the menu's right edge with x.
- `keyboard` (`boolean`, default `false`): Highlight the first item at once (opened with the keyboard).
- `label` (`string`, default `"Menu"`): Accessible name.
- `onclose` (`(restoreFocus: boolean, chosen: boolean) => void`, required): Close it; restoreFocus is true after Esc or
  a command, chosen when a command ran (from a submenu too).
- `onstep` (`(step: 1 | -1) => void`): Left and Right go here instead of closing (MenuBar's next menu).

## Rules

- Shortcut hints come from commandKeys(id), never typed by hand.
- A command with `checked` is a check item; the menu then lines up every label after the mark's room.

## Example: Context menu

```svelte
<div oncontextmenu={(event) => {
  event.preventDefault();
  at = { x: event.clientX, y: event.clientY };
}}>
{#if at}<Menu {items} x={at.x} y={at.y} onclose={() => (at = null)} />{/if}
```

## Replaces in the app

- `contextMenu.open(event, items) and ContextMenuHost.svelte`

## Logic

- `logic/menuModel.ts`
