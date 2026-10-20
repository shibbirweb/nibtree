# Aligned Diffs

The **Aligned** layout shows a diff side by side the way VS Code does. Both sides scroll as one, and every line sits level with its match on the other side. Where one side has lines the other lacks, the other side shows a hatched filler of the same height, so the rows below stay lined up.

[TODO:diff-aligned.png]

*An aligned diff of cart.ts: the old version on the left and the new one on the right, a hatched filler where a side has no lines, and a red - or green + before each changed line.*

## Switch to Aligned

Click **Aligned** in the diff toolbar (the button with two columns of short lines, after **Side by side**), or pick **Aligned** under **Diff layout** in Settings > Git. Both change the same setting, and your choice is used for every diff: in [Changes](Changes-and-Commits.md), the [Log](History-and-Log.md), commit tabs, compare tabs and the Changes tab of the status bar. **Side by side** stays the default.

How it differs from the other two layouts:

- **Side by side** keeps each side as plain code. Each side scrolls on its own and a colored band joins a change's lines across the gap.
- **Aligned** pads the shorter side instead, so a change's lines face each other with no band between them. There is one scrollbar for both sides.
- **Inline** puts both versions in one column. See [Inline Diffs](Inline-Diffs.md).

## Reading an aligned diff

- Old lines are soft red on the left and new lines green on the right, and inside a changed line the words that changed are stronger.
- Each side has its line numbers on the left. A red **-** after the number marks a removed or changed old line, and a green **+** an added or changed new line.
- A hatched filler (thin diagonal stripes) stands where lines were only added or only removed: on the left for added lines, on the right for removed ones.
- The strip next to the scrollbar has a tick for every change. Click a tick to jump there.

Everything else works as in the side by side layout: the Up and Down arrows (F7 and Shift+F7), the counter, **Collapse unchanged**, **Open File**, **Blame**, Cmd+F in either side, and dragging the line between the sides to resize them.

## Stage or unstage one change

The change buttons sit beside the line numbers, the same as in the side by side layout:

- In a diff from **Changes**, **«** (**Stage this change**) is on the right side, with **Revert this change** next to it ([Revert a Change](Revert-a-Change.md)).
- In a diff from **Staged**, **»** (**Unstage this change**) is on the left side.

**Stage Lines**, **Unstage Lines** and **Discard Lines** take the changed lines you select, in either side.

## Related

- [Diffs](Diffs.md)
- [Inline Diffs](Inline-Diffs.md)
- [How the aligned diff works (developer)](../developer/How-the-Aligned-Diff-Works.md)
