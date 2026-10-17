# DiffFrame

The frame of a diff whose editors the app builds: side names, find bar slots, body, split handle.

```ts
import DiffFrame from "@nibtree/ui/components/DiffFrame.svelte";
```

Group: Editor. Also known as: Diff, Diff host.

## When to use

Use when the app builds the diff's CodeMirror editors itself (staging, blame, folds). `onready` hands over the body and
a find bar container per side; labels, find bars and editors share `ratio`. Without `onapply` and `onrevert` the
connector draws ribbons alone in a narrow gap, as when the sides carry the buttons in their gutters
(editor/splitGutters.ts). DiffView is built on it.

## Props

- `layout` (`"split" | "inline"`, default `"split"`): Side by side, or one column with one label and one find bar.
- `label` (`string`, required): Accessible name.
- `sideLabels` (`{ original: string; modified: string } | null`, default `null`): Names over the two sides.
- `ribbons` (`ConnectorRibbon[] | null`, default `null`): Side by side: a band per change joining its lines on both
  sides, measured from the body's top; each side then scrolls itself.
- `applySide` (`"left" | "right"`, default `"left"`): Which side's change the arrow on a band applies.
- `onapply` (`(index: number) => void`): Shows an arrow on each band, such as Stage this change.
- `applyTitle` (`string | null`, default `null`): The arrow's tooltip.
- `onrevert` (`(index: number) => void`): Shows a revert button on each band, such as Revert this change.
- `revertTitle` (`string | null`, default `null`): The revert button's tooltip.
- `colors` (`ConnectorColors`, default `"kinds"`): Ribbons by kind ("kinds"), or red to green: "oldToNew" or "newToOld".
- `ruler` (`boolean`, default `false`): Room for a change overview ruler at the right of one editor.
- `ratio` (`number`, default `0.5`, bindable): The split between the sides; drag the handle to change it.
- `oncommitratio` (`(ratio: number) => void`): A drag or a key ended: save the ratio.
- `onready` (`(parts: DiffFrameParts) => void | (() => void)`): The body and find bar hosts, once shown.
- `oncontextmenu` (`(event: MouseEvent) => void`): Right-click in the body, for the diff's menu.

## Rules

- Never draw UI in the body: it holds only the editors the app builds.

## Example: The Changes diff

```svelte
<DiffFrame label="cart.ts" sideLabels={names} {ribbons} {onapply} ruler bind:ratio onready={build} />
```

## Replaces in the app

- `src/lib/diff/DiffView.svelte (labels, find bars, body and split handle)`

## Logic

- `logic/splitRatio.ts`
