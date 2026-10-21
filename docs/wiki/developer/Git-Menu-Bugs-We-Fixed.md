# Git Menu Bugs We Fixed

The bugs we found in the Git menu and its dialogs, why they happened and how we fixed them. How the menu works is in [How the Git Menu Works](How-the-Git-Menu-Works.md); the tests that drive it are in [Git Menu UI Tests](Git-Menu-UI-Tests.md).

**Nine Git dialogs closed without doing anything.**
- **The issue:** Pull, Push, Merge, Rebase, Reset HEAD, Rollback, Shelve, New Worktree and Checkout Tag or Revision in the Branches popup closed when their button was pressed, and git never ran. No error showed. The Git menu UI tests found it.
- **Why it happened:** `GitDialogHost` passes `repoRoot={active.repoRoot}`, and a Svelte 5 prop reads its source every time. Each `submit` called `close()`, which clears `gitDialogs.active`, and only then read `repoRoot`, so it threw on `null`. The click handlers are `() => void submit()`, so the error was dropped.
- **The fix and why we chose it:** each `submit` copies the props it needs (`targetRepo`, and the branch or options derived from them) before `close()`. Closing first keeps a second click from running it twice. The UI tests in `scripts/ui-test/` press every one of these buttons, so it cannot come back unseen.

**Show History for Selection traced the wrong lines.**
- **The issue:** with uncommitted lines added or deleted above the selection, the tab showed the history of other lines.
- **Why it happened:** the menu passed the editor's line numbers, but `git log -L` reads them against HEAD.
- **The fix and why we chose it:** `headLineRange` maps the selection to HEAD lines before the tab opens, with the same line diff as the change markers, and only new lines give a message. Mapping in the frontend uses the unsaved editor text, which the backend never sees; the tab keeps HEAD numbers, so Refresh stays right while you keep editing.
