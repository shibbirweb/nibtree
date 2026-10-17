# MergeStackFrame

The stacked frame of a 3-way merge: yours and theirs side by side on top, the result below.

```ts
import MergeStackFrame from "@nibtree/ui/components/MergeStackFrame.svelte";
```

Group: Editor. Also known as: Merge, Stacked merge, Merge host.

## When to use

The other layout of MergeFrame, for a merge read top to bottom. Like it, it draws no editor: `onready` hands over the
three panes. It has no connectors, so the app marks each change with a lens of links above it (editor/chunkLens.ts
`chunkLenses`: Accept, Accept both, Ignore). Load it only when it is picked, with a dynamic import. Drag the line under
the top row, or between the top panes, to resize.

## Props

- `label` (`string`, required): Accessible name.
- `labels` (`{ left; result; right }`, default `{ left: "Yours", result: "Result", right: "Theirs" }`): Pane titles.
- `fileName` (`string`, default `""`): Shown dim after the result's title.
- `topHeight` (`number`, default `0`, bindable): The top row's height in px; 0 starts it at half the frame.
- `ratio` (`number`, default `0.5`, bindable): The split between the two top panes, 0 to 1.
- `oncommit` (`(topHeight: number, ratio: number) => void`): A drag ended: save the sizes.
- `resultEnd` (`Snippet`): At the end of the result's title, such as how many changes are left.
- `onready` (`(parts: MergeFrameParts) => void | (() => void)`): The panes, once shown.

## Rules

- Never draw UI in the panes: they hold only the editors the app builds.

## Example: The merge tool, stacked

```svelte
<MergeStackFrame label="Merge" {labels} fileName="app.ts" onready={build} />
```

## Replaces in the app

- `a second merge layout`
