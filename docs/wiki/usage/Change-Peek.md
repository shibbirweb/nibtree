# Change Peek

The change peek shows one change of the file you are editing right where it is, the way VS Code does. Click a change bar beside the line numbers, and a panel opens under the change with its diff. From there you can stage the change, revert it, or step to the next one, without leaving the editor.

[TODO:change-peek.png]

*The change peek under an added line in cart.ts: the file name, Working tree changes with the counter, the buttons at the right, and the change's diff in the inline layout.*

## Open the peek

While you edit, colored bars beside the line numbers show what you changed against the **index** (the staging area, what your next commit will hold). When nothing of the file is staged, that is the last commit. See [Editor and Tabs](Editor-and-Tabs.md#change-markers).

- For added or modified lines, click the bar beside them.
- For deleted lines, click the small red wedge where they were.

The peek opens under the change and the cursor moves to the change's first line. Its top and bottom lines take the change's color: green for added lines, blue for modified ones and red for deleted ones.

## Reading the peek

The header names the file, then says **Working tree changes** and which change you are on, such as **2 of 4 changes**. Below it is the whole file's diff, the **Index** against the **Working Tree** (your text in the editor, saved or not), scrolled to the change.

The diff uses the layout from **Diff layout** in Settings > Git: [Side by side](Diffs.md), [Aligned](Aligned-Diffs.md) or [Inline](Inline-Diffs.md). **Collapse unchanged** works as in other diffs. You can scroll inside the peek, and select and copy text.

## The buttons

At the right of the header:

- **Stage this change** (+): copies only this change into the index. Its bar goes away, and the peek moves on to the change that takes its place. Staging works on the text in the editor, even when it is not saved yet.
- **Revert this change** (curved arrow): puts the staged lines back in place of this change, after you confirm. This is an ordinary edit: **Edit > Undo** brings your lines back, and nothing is saved until you save. See [Revert a Change](Revert-a-Change.md).
- **Next change** and **Previous change** (arrows): move the peek to the next or the previous change in the file. After the last one they wrap to the first.
- **Close** (x): closes the peek. Escape inside the peek does the same.

A read-only file has no Stage or Revert button.

Typing in the file closes the peek, since the diff it shows would be out of date. Click the bar again to see the change as it is now.

## Example

In `src/cart.ts` you added a `Queue.dispatch(...)` line and also rewrote `total()`. Click the green bar beside the new line: the peek shows **1 of 2 changes**. Click **Stage this change** to stage only that line. The peek moves on to the `total()` change, which you keep for a later commit.

## Related

- [Editor and Tabs](Editor-and-Tabs.md)
- [Revert a Change](Revert-a-Change.md)
- [Diffs](Diffs.md)
- [How the change peek works (developer)](../developer/How-the-Change-Peek-Works.md)
