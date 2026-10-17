# MergeFrame

The frame of a 3-way merge whose editors the app builds: pane titles, three panes, connectors.

```ts
import MergeFrame from "@nibtree/ui/components/MergeFrame.svelte";
```

Group: Editor. Also known as: Merge, Merge host.

## When to use

Use when the app builds the merge's CodeMirror editors itself (its own chunks, undo and scrolling). `onready` hands over
the three panes and the box the ribbons are measured from. Without `onapply`, `onignore` and `onrevert` the connectors
draw ribbons alone in narrow gaps, as when the panes carry the buttons beside their line numbers (editor/mergeGutters.ts
`paneGutters`). MergeView is built on it.

## Props

- `label` (`string`, required): Accessible name.
- `labels` (`{ left; result; right }`, default `{ left: "Yours", result: "Result", right: "Theirs" }`): Pane titles.
- `fileName` (`string`, default `""`): Shown dim after the result's title.
- `height` (`"fill" | "small" | "medium" | "large"`, default `"fill"`): Fill the parent, or 160, 240 or 360 px.
- `leftRibbons` (`ConnectorRibbon[]`, default `[]`): The left connector's ribbons, from the left pane to the result.
- `rightRibbons` (`ConnectorRibbon[]`, default `[]`): The right connector's ribbons, from the result to the right pane.
- `onapply` (`(index: number, side: "left" | "right") => void`): A chunk's Apply button; left out, none.
- `onignore` (`(index: number, side: "left" | "right") => void`): A chunk's Ignore button; left out, none.
- `onrevert` (`(index: number, side: "left" | "right") => void`): A chunk's Revert button; left out, none.
- `applyTitles` (`{ left: string; right: string } | null`, default `null`): The Apply buttons' tooltips per side, such
  as Unstage this change and Stage this change.
- `revertTitle` (`string | null`, default `null`): The Revert buttons' tooltip.
- `actionSides` (`("left" | "right")[]`, default `["left", "right"]`): The connectors whose chunks get buttons; the
  others draw ribbons alone, such as a commit's change against the work tree.
- `colors` (`{ left: ConnectorColors; right: ConnectorColors }`, default `{ left: "kinds", right: "kinds" }`): Each
  connector's ribbon colors.
- `split` (`ThreeSplit ([number, number])`, default `[1 / 3, 2 / 3]`, bindable): Where the left pane ends and the right
  pane starts, 0 to 1 of the width the panes share; dragging a connector's edge moves it, double-click makes even
  thirds.
- `oncommitsplit` (`(split: ThreeSplit) => void`): A drag ended or a key moved a pane edge: save it.
- `onready` (`(parts: MergeFrameParts) => void | (() => void)`): The panes, once shown.

## Rules

- Never draw UI in the panes: they hold only the editors the app builds.

## Example: The merge tool

```svelte
<MergeFrame label="Merge" {labels} {leftRibbons} {rightRibbons} onapply={apply} onready={build} />
```

## Replaces in the app

- `src/lib/merge/MergeEditor.svelte (pane titles, panes and connectors)`

## Logic

- `logic/mergeGeometry.ts`
- `logic/threeSplit.ts`
