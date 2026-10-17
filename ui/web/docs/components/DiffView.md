# DiffView

Two versions of a text compared, side by side or inline, in the app's diff colors.

```ts
import DiffView from "@nibtree/ui/components/DiffView.svelte";
```

Group: Editor. Also known as: Diff, Compare.

## When to use

Use for file diffs, the Changes diff and compare tabs. Side by side, each side's line numbers face the other and a
change's color runs through them (editor/splitGutters.ts). The app adds staging buttons (`splitPaneGutters`, beside the
numbers), folds (editor/foldRow.ts) and its other diff features through `extensions`.

## Props

- `original` (`string`, required): The old text (left, or the removed lines).
- `modified` (`string`, required): The new text.
- `layout` (`"split" | "inline"`, default `"split"`): Side by side, or one column.
- `language` (`"plain" | "ts" | "js" | "svelte" | "html" | "css" | "json" | "md" | "python" | "rust"`, default
  `"plain"`): Syntax colors.
- `height` (`"fill" | "small" | "medium" | "large"`, default `"fill"`): Fill the parent, or 160, 240 or 360 px.
- `label` (`string`, required): Accessible name.
- `sideLabels` (`{ original: string; modified: string } | null`, default `null`): Names over the two sides.
- `ratio` (`number`, default `0.5`, bindable): The split between the sides; drag the handle to change it.
- `oncommitratio` (`(ratio: number) => void`): A drag or a key ended: save the ratio.
- `extensions` (`Extension[]`, default `[]`): More CodeMirror extensions, on both sides.

## Example: A file's change

```svelte
<DiffView label="app.ts" {original} {modified} language="ts" />
```

## Replaces in the app

- `src/lib/views/changes/ChangesDiff.svelte panes`
