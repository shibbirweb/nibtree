# Inline Diffs

Every diff can show its two versions side by side, or inline in one column. Inline is handy in a narrow window, or when long lines get cut off in two columns.

![An inline diff: removed lines above the lines that replace them](../images/diff-inline.png)

*An inline diff of cart.ts: the old and new line numbers on the left, a red - or green + before each changed line, each change's removed lines above the lines that replace them, and the layout buttons in the toolbar.*

## Switch the layout

Pick **Diff layout** in Settings > Git, or use the buttons in the diff toolbar, after the change counter:

- **Side by side** (a box split down the middle): the old version on the left, the new one on the right. This is the default.
- **Aligned** (two columns of short lines): side by side, line for line, scrolling as one. See [Aligned Diffs](Aligned-Diffs.md).
- **Inline** (a box split across): one column. Each change shows the lines it removed, then the lines it added.

The highlighted button is the layout in use, and both places change the same setting. Your choice is remembered and used for every diff: in [Changes](Changes-and-Commits.md), the [Log](History-and-Log.md), commit tabs, compare tabs and the Changes tab of the status bar. The buttons are greyed out for images, PDFs and files without text changes.

## Reading an inline diff

- Each line has its own color: removed lines are a soft red and added lines green, also inside a changed block (old lines followed by their new lines).
- Right before the text, a red **-** marks a removed line and a green **+** an added line, like `git diff`.
- Inside a changed block, the exact words that changed are a stronger red in the old lines and a stronger green in the new ones.
- Two columns of line numbers sit on the left: the old version's number, then the new version's. A removed line has only an old number, an added line only a new one.
- The label above the diff names both versions, such as **Index** and **Working Tree**, with an arrow between them.

Removed lines are real text: you can select them, copy them and find them. Cmd+F searches both versions, and a match inside folded unchanged lines opens them.

Everything else works as in the side by side layout: the Up and Down arrows (F7 and Shift+F7), the counter, **Collapse unchanged**, **Open File**, the strip of change ticks and **Blame**, which shows who wrote each new line (removed lines have no blame).

## Stage or unstage one change

In a diff from **Changes**, the first line of each change has a small **+** button between the line numbers and the code, **Stage this change**. In a diff from **Staged**, the button is **-**, **Unstage this change**. They do the same as the **«** and **»** buttons of the side by side layout (see [Diffs](Diffs.md#stage-or-unstage-one-change)).

In a diff from **Changes**, the curved arrow after the **+** is **Revert this change**. See [Revert a Change](Revert-a-Change.md).

**Stage Lines**, **Unstage Lines** and **Discard Lines** take exactly the lines you select: select only the new lines to add them while keeping the old ones, select only removed lines to remove just those, or both. With no selection, they take the line the cursor is on.

## Related

- [Diffs](Diffs.md)
- [Changes and Commits](Changes-and-Commits.md)
- [How the inline diff works (developer)](../developer/How-the-Inline-Diff-Works.md)
