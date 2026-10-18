# ResizeHandle

A drag handle on a panel's edge: a line that becomes an accent bar on hover; keys and double-click.

```ts
import ResizeHandle from "@nibtree/ui/components/ResizeHandle.svelte";
```

Group: Layout. Also known as: Resizable handle.

## When to use

Use beside a panel whose size the parent keeps. SplitPane wraps it for the common two-pane case.

## Props

- `size` (`number`, required): The panel's current width, or height for the bottom side.
- `side` (`"left" | "right" | "top" | "bottom"`, required): Where the panel is, relative to the handle.
- `preset` (`"sidebar" | "bottom" | "list" | "pane" | "files"`, required): The smallest and default size.
- `max` (`number`, required): Largest size, from the window's room.
- `min` (`number | null`, default `null`): Smallest size when the layout decides it, instead of the preset's.
- `defaultSize` (`number | null`, default `null`): Size a double-click resets to when the layout decides it, such as
  half of a split.
- `label` (`string`, required): Accessible name.
- `inPanel` (`boolean`, default `false`): Between views inside one panel (editor groups): keeps its size in rounded
  looks.
- `onresize` (`(size: number) => void`, required): The new size while dragging or on a key.
- `oncommit` (`(size: number) => void`): Called once when it ends, to save the size.

## States

Draws hover, dragging; scenarios force them with `state`.

## Example: Left panel

```svelte
<ResizeHandle {size} side="left" preset="sidebar" max={600} label="Resize Files"
  onresize={(next) => (size = next)} oncommit={save} />
```

## Replaces in the app

- `src/lib/ui/ResizeHandle.svelte (panel becomes side, onResize becomes onresize)`

## Logic

- `logic/resize.ts`
