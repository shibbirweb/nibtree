# Conflict Resolution Bugs We Fixed

The bugs we found in the conflict banner, the Conflicts dialog, the inline actions and Continue and Abort, why they happened and how we fixed them. How it all works is in [How Conflict Resolution Works](How-Conflict-Resolution-Works.md); the user side is in [Resolving Conflicts](../usage/Resolving-Conflicts.md).

**A refused Abort said "stopped with conflicts".**
- **The issue:** when git refused to abort a merge (a file had staged changes and then more changes on top), Nibtree said "Abort stopped with conflicts. Resolve them to continue." and opened the conflicts. Git's real reason ("Entry ... not uptodate") never showed. A full test run of the git tools found it.
- **Why it happened:** `abort_operation` ran git through `run_op`, whose `outcome` treats a failed command that leaves conflicts behind as a normal stop with conflicts. That is right for a merge that stops, but after a refused abort the conflicts are simply still there.
- **The fix and why we chose it:** `abort_operation` in `commands/merge.rs` runs `git ... --abort` with `cli::run` directly, so a refusal is an error with git's own message, shown as an error toast. Only Abort changed: Continue and the operations that start a merge still need the conflicts outcome. `an_abort_that_git_refuses_is_an_error_with_its_reason` in `mcp/tests/git_tools/operations.rs` covers it.

**Escape closed two dialogs at once.**
- **The issue:** pressing Escape on a confirmation shown over the Conflicts dialog closed both.
- **Why it happened:** its window Escape handler also got the key meant for the confirmation.
- **The fix and why we chose it:** its `onKeydown` returns early when `event.defaultPrevented` or `dialogs.active` is set. The same check is now a project rule for every window-level key handler.

**The conflict counter was hidden.**
- **The issue:** in a file with several conflicts, the "Conflict 1 of 2" counter at the end of the inline actions row never showed at normal window sizes.
- **Why it happened:** the actions row is a block inside the editor content, which is as wide as its longest line, so the row never wrapped and the counter sat past the visible edge.
- **The fix and why we chose it:** the ViewPlugin `barWidth` in `conflictDecorations.ts` measures the visible editor width on every geometry change and sets `--cm-conflict-bar-width`. The row is capped at that width and wraps, so the counter moves to a second line instead of disappearing.

**Esc stopped closing the Conflicts dialog.**
- **The issue:** after Accept Yours or Accept Theirs resolved the last conflict, Esc no longer closed the Conflicts dialog; only its close button did. The Git menu UI tests found it.
- **Why it happened:** the clicked button went away with the list, so the focus fell to the page, and `Dialog` handled keys only on its own element.
- **The fix and why we chose it:** `Dialog` also listens on the window, and `ownsStrayKey` (`ui/web/src/lib/logic/dialogFocus.ts`) gives it a key only when the focus is on the page and it is the topmost dialog; it then takes the focus back. Every dialog gets this, and a key meant for a field or for a dialog above is never taken. `conflicts.ts` in `scripts/ui-test/` presses Esc right after the last Accept.
