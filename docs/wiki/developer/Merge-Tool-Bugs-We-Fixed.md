# Merge Tool Bugs We Fixed

The bugs found in the [merge tool](How-the-Merge-Tool-Works.md), what caused each, and why we fixed it the way we did. The user side is in [Merge Tool](../usage/Merge-Tool.md).

**The engine check compared too few merges.**
- **The issue:** the test failed with "too few clean cases compared: 8".
- **Why it happened:** random edits hit one line in 12, so nearly every merge conflicted.
- **The fix and why we chose it:** one line in 40, 300 runs, over 50 clean comparisons required and under 5% disagreement, so the check means something.

**Undo could restore the wrong chunk state.**
- **The issue:** undoing grouped steps could bring back buttons from the wrong moment.
- **Why it happened:** grouped undo events carry several `setChunks` effects, oldest last.
- **The fix and why we chose it:** `chunkField` takes the last `setChunks` effect of a transaction.

**Apply non-conflicting could send overlapping edits.**
- **The issue:** after heavy manual edits, one click could produce overlapping edits, which CodeMirror rejects.
- **Why it happened:** a chunk grown by typing could touch the previous one.
- **The fix and why we chose it:** `applyNonConflicting` leaves such a chunk for you instead of guessing.

**Word highlights on unrelated lines.**
- **The issue:** mostly rewritten lines got scattered word highlights instead of one block.
- **Why it happened:** the "unrelated text" guard counted matching whitespace, and skipped base tokens were counted twice.
- **The fix and why we chose it:** `changedSpans` counts only matched words and returns null under 30% match.

**Cmd+Enter added a line instead of applying.**
- **The issue:** in the Result pane, Cmd+Enter inserted a blank line, so you had to click a side pane or Apply.
- **Why it happened:** CodeMirror's default keymap binds Cmd+Enter to "insert blank line". The Result is editable, so the editor used the key first, and the window handler, which skips handled keys, never saw it.
- **The fix and why we chose it:** `applyKeymap` adds a high-priority Cmd+Enter binding to all three panes and their search bars. Winning inside CodeMirror is simpler and safer than bending the window handler's "already handled" rule.

**The close button dropped your work.**
- **The issue:** the X in the title bar closed the tool at once and threw away an edited result, while Cancel and Esc asked first.
- **Why it happened:** the X called `repoStore.closeMerge()` directly; the "Discard Changes" question lived only in the editor's cancel.
- **The fix and why we chose it:** `MergeEditor` exports `cancel()` and the X calls it, so the X, Cancel and Esc share one path and one question. With no editor shown (loading, errors, binary files) the X closes at once, as there is nothing to lose.
