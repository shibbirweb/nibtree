# PeekPanel

A band set into an editor under a line, like VS Code's peek: a header with buttons, then content.

```ts
import PeekPanel from "@nibtree/ui/components/PeekPanel.svelte";
```

Group: Editor. Also known as: Peek, Inline panel, Quick diff.

## When to use

Put it in an editor's block widget, such as the change peek under a changed line. Name what it shows in `title` and
`detail`, put compact IconButtons in `actions`, and the content (a DiffFrame) in `children`; it fills the set height.
`tone` colors the lines above and below like the change.

## Props

- `label` (`string`, required): Accessible name.
- `title` (`string`, required): The title, such as the file name.
- `detail` (`string | null`, default `null`): Quieter text after the title, such as the counter.
- `tone` (`"added" | "modified" | "deleted" | "neutral"`, default `"neutral"`): The lines' color, like the change.
- `height` (`"xsmall" | "small" | "medium" | "large" | "xlarge"`, default `"large"`): The whole band's height.
- `actions` (`Snippet`): Buttons at the end of the header.
- `onclose` (`() => void`): Escape inside the panel.
- `children` (`Snippet`, required): The content, filling the rest.

## Example: A change

```svelte
<PeekPanel label="Change" title="cart.ts" detail="2 of 4 changes" tone="added">...</PeekPanel>
```
