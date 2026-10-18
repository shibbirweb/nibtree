# AppHeader

The bar across the top of the window: navigation and pickers on the left, busy work and actions right.

```ts
import AppHeader from "@nibtree/ui/components/AppHeader.svelte";
```

Group: Layout. Also known as: Header, Title bar, Top bar.

## When to use

Use once, as AppShell's header. Put history buttons, a vertical Divider and the folder, repository and branch pickers
(Button ghost with trailingIcon) in `start`; set `busy` while an operation runs.

## Props

- `busy` (`string`, default `""`): What is running; shows a spinner with it.
- `busyTitle` (`string`): A longer tooltip for the busy text.
- `look` (`"flat" | "rounded"`, default `"flat"`): A line under it, or the window frame's color with rounded panels.
- `tint` (`"none" | "blue" | "green" | "magenta" | "cyan" | "red"`, default `"none"`): Flat look: the rounded look's
  glow from the top left corner in the open project's color (its Welcome tile), on the bar itself; the rounded look
  shows AppShell's.
- `windowControls` (`boolean`, default `false`): The window's own buttons sit at its left (macOS without a title strip):
  leaves room for them and lets the bar's empty space move the window.
- `menuBar` (`Snippet`): A MenuBar (surface "none") in a row above, inside the same background and glow: an app without
  a system menu bar, such as in a browser tab.
- `start` (`Snippet`, required): Left side; shrinks and truncates first.
- `end` (`Snippet`): Right side actions.

## Example: Window

```svelte
<AppHeader busy={progress} {start} {end} />
```

## Replaces in the app

- `src/lib/views/Header.svelte layout`
