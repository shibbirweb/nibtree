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

**A Git command chosen while another was finishing did nothing.**
- **The issue:** now and then Fetch All Remotes, or Mark Good during a bisect, did nothing at all: no git command, no message. The Git menu UI tests on Linux found it.
- **Why it happened:** every Git action that changes the repository runs through `git()` in `menuActions.ts`, which skips it while `repoStore.busy` is set. The menu greys those items out while busy, but a click that lands just as a command starts got past that and was dropped silently.
- **The fix and why we chose it:** `git()` now says "Wait for ... to finish" instead of nothing, and `menuState.ts` greys out every Git action that waits (`waitsForGit`), not each one by hand. `GIT_VIEW_ACTIONS` in `menuIds.ts` lists the ones that never wait, and `menuIds.test.ts` reads `menuActions.ts` so the two lists cannot drift. Queueing the command was left out: running the next git command blind after another changed the repository is not what the person saw when they chose it.


**Esc in the Git Remotes form left every Git command doing nothing.**
- **The issue:** in Git > Manage Remotes, Esc in the Add or Edit form should go back to the list. Instead the whole dialog went away, and from then on every Git menu item and workspace shortcut did nothing, with no message, until another Git dialog opened. The Linux UI tests found it as "Fetch All Remotes fetches every remote" failing now and then.
- **Why it happened:** the library `Dialog` hid itself first (`open = false`) and only then called `onclose`. The Remotes dialog's `onclose` takes Esc in the form as "back to the list", so it cleared the form and kept `gitDialogs.active` set. The dialog was gone from the screen, but the app still counted it as open, and `shortcutsBlocked()` refuses every workspace action while a Git dialog is open. The name and email dialog did the same when Esc came while it saved, so the commit waiting on it never went on.
- **The fix and why we chose it:** `onclose` may now answer `false` to keep the dialog open, and `Dialog` hides only when it does not (`dismissDialog` in `ui/web/src/lib/logic/dialogKeys.ts`, tested). The dialog that owns the state decides, so the screen and the state can no longer disagree. The sync UI test presses Esc in the Add form and checks the list is back; it fails on the old `Dialog` at normal speed. `UI_TEST_CPU` in the UI tests slows the page down to bring out timing bugs like this one before CI does.
