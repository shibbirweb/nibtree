# ActivityBar

The vertical icon bar beside a side panel; the open panel is tinted with an accent line.

```ts
import ActivityBar from "@nibtree/ui/components/ActivityBar.svelte";
```

Group: Layout. Also known as: Sidebar.

## When to use

Use at the window's left or right edge. A `null` item pushes the rest to the bottom; "divider" draws a short line
between groups. Give an item `active` when it is on by itself (the Log, the terminal). With `movable`, icons drag
between both bars' top and bottom groups: keep the places in an ActivityLayout (logic/activityLayout.ts) and apply
`onmove` with `moveActivity`; offer the same moves in `oncontextmenu`.

## Props

- `items` (`({ id; icon; label; badge?: number; badgeTone?: "accent" | "danger" | "warning"; dot?: boolean; smallIcon?:
  boolean; active?: boolean; title?: string } | null | "divider")[]`, required): The panels; `title` is the tooltip,
  such as the name with its shortcut.
- `active` (`string | null`, default `null`, bindable): The open panel's id.
- `label` (`string`, required): Accessible name.
- `side` (`"left" | "right"`, default `"left"`): Which window edge; moves the border and accent line.
- `movable` (`boolean`, default `false`): Icons can be dragged to another place in either bar; a line shows where.
- `onselect` (`(id: string) => void`): A panel button was clicked.
- `onmove` (`(id: string, target: { slot: "left-top" | "left-bottom" | "right-top" | "right-bottom"; index: number }) =>
  void`): A dragged icon was dropped: the group and the place in it (the bar it came from calls it).
- `oncontextmenu` (`(id: string, event: MouseEvent) => void`): An icon was right-clicked, for a menu.

## Example: Left bar

```svelte
<ActivityBar label="Side panels" {items} bind:active />
```

## Example: Movable

```svelte
<ActivityBar label="Side panels" items={barItems(layout, "left")} movable
  onmove={(id, target) => (layout = moveActivity(layout, id, target.slot, target.index))} />
```

## Replaces in the app

- `<nav class="activity"> in ActivityBar.svelte and RightActivityBar.svelte`
