# SplitPane

Two panes side by side or stacked, with a ResizeHandle between; `size` is one pane's px.

```ts
import SplitPane from "@nibtree/ui/components/SplitPane.svelte";
```

Group: Layout. Also known as: Resizable, Splitter.

## When to use

Use for a sidebar and an editor, or an editor and a bottom panel. Save `size` in oncommit.

## Props

- `direction` (`"row" | "column"`, default `"row"`): Side by side or one above the other.
- `size` (`number`, required, bindable): The sized pane's width (row) or height (column) in px, as the user dragged it.
- `sized` (`"first" | "second"`, default `"first"`): Which pane `size` is: second for a list on the right.
- `preset` (`"sidebar" | "bottom" | "list" | "pane" | "files"`, default `"pane"`): The smallest and default size.
- `max` (`number`, default `800`): Largest size, from the window's room.
- `label` (`string`, required): Accessible name of the handle, e.g. `Resize the sidebar`.
- `extent` (`number`, default `0`, bindable): Its own measured width (row) or height (column), so the app can work out
  `max`.
- `inPanel` (`boolean`, default `false`): Between views inside one panel: the handle keeps its size in rounded looks.
- `oncommit` (`(size: number) => void`): Called once when a drag or key press ends, to save the size.
- `first` (`Snippet`, required): The first pane.
- `second` (`Snippet`): The second pane; leave it out to show the first alone, still mounted.

## States

Draws hover, dragging; scenarios force them with `state`.

## Example: Sidebar

```svelte
<SplitPane label="Resize the sidebar" bind:size>
  {#snippet first()}<Files />{/snippet}
  {#snippet second()}<Editor />{/snippet}
</SplitPane>
```

## Replaces in the app

- `Workspace.svelte's sidebar and editor columns with a ResizeHandle`

## Logic

- `logic/resize.ts`
