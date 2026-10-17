# MergeConnector

The column between two merge or diff panes: a ribbon per chunk and its apply, ignore and revert buttons.

```ts
import MergeConnector from "@nibtree/ui/components/MergeConnector.svelte";
```

Group: Editor. Also known as: Ribbon, Connector.

## When to use

MergeFrame and DiffFrame draw this between their panes; use it alone only for a custom layout. Its buttons stay inside
the column while any of the chunk shows, and each shows only with its handler. Without any handler it draws ribbons
alone and is narrow; the app's views put their buttons in the panes' gutters instead (editor/mergeGutters.ts).

## Props

- `ribbons` (`ConnectorRibbon[] ({ index; kind; aTop; aBottom; bTop; bBottom })`, required): Each chunk's lines on both
  sides, in pixels from the column's top.
- `side` (`"left" | "right"`, required): Which pane the buttons apply from.
- `onapply` (`(index: number) => void`): Apply a chunk.
- `onignore` (`(index: number) => void`): Ignore a chunk.
- `onrevert` (`(index: number) => void`): Revert a chunk in the buttons' own pane.
- `applyTitle` (`string | null`, default `null`): The apply button's tooltip, such as Stage this change.
- `revertTitle` (`string | null`, default `null`): The revert button's tooltip, such as Revert this change.
- `colors` (`ConnectorColors`, default `"kinds"`): Ribbons by kind ("kinds"), or red to green: "oldToNew" or "newToOld".

## Example: Between panes

```svelte
<MergeConnector side="left" {ribbons} onapply={apply} />
```

## Replaces in the app

- `the .connector SVG of src/lib/merge/MergeEditor.svelte`

## Logic

- `logic/mergeGeometry.ts`
