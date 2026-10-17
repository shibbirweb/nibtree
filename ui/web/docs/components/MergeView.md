# MergeView

The 3-way merge: yours, the editable result and theirs, chunks tinted and joined by ribbons.

```ts
import MergeView from "@nibtree/ui/components/MergeView.svelte";
```

Group: Editor. Also known as: Merge, 3-way merge, Conflict.

## When to use

Use for resolving a conflicted file. The app computes the chunks (line ranges in each pane) and applies a chunk when
`onapply` is called; scrolling one pane scrolls the others. Each side's line numbers face the result with its Apply and
Ignore beside them, and a chunk's color runs through the numbers. Built on MergeFrame.

## Props

- `left` (`string`, required): Your version.
- `result` (`string`, default `""`, bindable): The merged text being edited.
- `right` (`string`, required): Their version.
- `chunks` (`MergeChunk[] ({ kind; left; result; right: [start, end) })`, required): Each change, with its line ranges.
- `labels` (`{ left; result; right }`, default `{ left: "Yours", result: "Result", right: "Theirs" }`): Pane titles.
- `fileName` (`string`, default `""`): Shown dim after the result's title.
- `language` (`"plain" | "ts" | "js" | "svelte" | "html" | "css" | "json" | "md" | "python" | "rust"`, default
  `"plain"`): Syntax colors.
- `height` (`"fill" | "small" | "medium" | "large"`, default `"fill"`): Fill the parent, or 160, 240 or 360 px.
- `label` (`string`, required): Accessible name.
- `extensions` (`Extension[]`, default `[]`): More extensions for the result pane.
- `onapply` (`(index: number, side: "left" | "right") => void`): Take a chunk's change from a side.
- `onignore` (`(index: number, side: "left" | "right") => void`): Drop a side's change.

## Example: A conflict

```svelte
<MergeView label="Merge" {left} {right} {chunks} bind:result onapply={apply} />
```

## Replaces in the app

- `a merge of three plain texts (the app's merge tool uses MergeFrame)`

## Logic

- `logic/mergeGeometry.ts`
