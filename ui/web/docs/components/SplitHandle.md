# SplitHandle

A handle between two side-by-side views in one box: drag or arrow keys move the split.

```ts
import SplitHandle from "@nibtree/ui/components/SplitHandle.svelte";
```

Group: Layout. Also known as: Splitter.

## When to use

DiffFrame uses it between a diff's sides, MergeFrame on each connector's edge. Put it in a positioned box; double-click
puts it back at `resetRatio`.

## Props

- `ratio` (`number`, default `0.5`, bindable): The split, 0 to 1.
- `gutter` (`number`, default `0`): Px between the sides that never grow, such as a diff's change arrows.
- `resetRatio` (`number`, default `0.5`): Where a double-click puts the split back.
- `label` (`string`, required): Accessible name.
- `oncommit` (`(ratio: number) => void`): A drag ended or a key moved it: save it.

## States

Draws hover, dragging; scenarios force them with `state`.

## Example: Diff

```svelte
<SplitHandle bind:ratio label="Resize the sides" />
```

## Replaces in the app

- `.split-handle in src/lib/diff/DiffView.svelte`

## Logic

- `logic/splitRatio.ts`
