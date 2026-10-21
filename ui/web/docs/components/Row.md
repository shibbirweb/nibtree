# Row

One row of a list: hover, selected color, fold chevron, indent and hover actions around your content.

```ts
import Row from "@nibtree/ui/components/Row.svelte";
```

Group: Layout. Also known as: List item, Item, Row, Cell.

## When to use

Build every list row from it: put Icon, Text, Tag, StatusLetter and the like inside, and a Spacer before what sits at
the end. Pick the size for the place: tree (24 px, sidebars), list (24 px, file lists), history (26 px, commit lists),
entry (grows, 4 px above and below, dialogs), large (56 px, Welcome), section (28 px, a repository's header) or group
(24 px, lined up with a Collapsible's title, like the repositories under No Changes). Put Rows in a List for the
keyboard and selection; alone, a Row with `onclick` is a button.

## Props

- `size` (`"tree" | "list" | "history" | "entry" | "large" | "section" | "group"`, default `"list"`): Height, side
  padding and gap for the place it is used.
- `selected` (`boolean`, default `false`): The selected row; stronger while its List has the focus.
- `disabled` (`boolean`, default `false`): Faint and cannot be pressed.
- `depth` (`number`, default `0`): Indent levels, for nested rows.
- `expanded` (`boolean | "leaf" | null`, default `null`): A fold chevron; leaf keeps its room empty, null has none.
- `align` (`"center" | "baseline"`, default `"center"`): Baseline for rows of words in two sizes.
- `actionsShown` (`"hover" | "always"`, default `"hover"`): Show `actions` on hover, focus and the selected row, or
  always.
- `line` (`boolean`, default `false`): A line under the row, for rows in a ListBox (the last one has none).
- `mark` (`boolean`, default `false`): An accent stripe on its left edge, such as the active repository's header.
- `cursor` (`"default" | "pointer"`, default `"default"`): The hand cursor, for rows that open something like a link
  (the Welcome screen's projects).
- `title` (`string`): Tooltip, such as the full path.
- `label` (`string`): Accessible name, when the content alone does not say it.
- `id` (`string`): Its element id, so a list that keeps the focus elsewhere can point at it or scroll to it.
- `item` (`"option" | "treeitem" | null`, default `null`): An item of a ListRegion that keeps the keys: its role and
  selection for screen readers, and no tab stop; clicks still run onclick.
- `actions` (`Snippet`): Small buttons at the end; their clicks do not select the row.
- `children` (`Snippet`, required): The row's content.
- `onclick` (`(event: MouseEvent) => void`): Pressed (outside a List, this makes it a button).
- `ondblclick` (`(event: MouseEvent) => void`): Double-clicked.
- `oncontextmenu` (`(event: MouseEvent) => void`): Right-clicked, for its Menu.
- `onhover` (`() => void`): The pointer moved over it, to move a highlight.

## Rules

- Lay out the content with Text and Icon in the Row; use Stack grow for a column of two lines.
- Action buttons go in `actions`, never in the content, so they show on hover and keep the row's click.

## Example: A commit in a history list

```svelte
<Row size="history" selected={id === selectedId}>
  <Stack width="xsmall"><Text mono tone="dim" size="compact">{hash}</Text></Stack>
  <Text truncate>{subject}</Text>
  <Spacer />
  <Text tone="dim" tabular>{when}</Text>
</Row>
```

## Example: A folding row with hover actions

```svelte
<Row size="tree" expanded={open} depth={1}>
  <Icon name="stash" size="normal" />
  <Text truncate>{name}</Text>
  {#snippet actions()}<IconButton icon="trash" label="Delete" size="mini" />{/snippet}
</Row>
```

## Replaces in the app

- `.entry in FileHistoryTab, LineHistoryTab and ReflogTab`
- `.version and .deleted-row in LocalHistoryDialog`
- `.entry and .file in ShelfPanel`
- `.item in TerminalPanel, .row in ScriptsPanel and TerminalMemory`
- `.agent, .project and .card-head in AiPanel`
- `.commit in BranchCompareTab and PushDialog, .branch in BranchesPopup`
- `.row in GitConsoleView, .call in McpToolsDialog, .action in EmptyMain`
- `.project and .learn-item in Welcome`
