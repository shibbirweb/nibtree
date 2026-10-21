# Editor Bugs We Fixed

The bugs found in the [file editor](How-the-Editor-Works.md), what caused each, and why we fixed it the way we did. The user side is in [Editor and Tabs](../usage/Editor-and-Tabs.md).

**A selection inside one line was invisible.**
- **The issue:** selecting text inside one line showed no selection at all.
- **Why it happened:** CodeMirror draws the selection behind the text, and the opaque current line background on the cursor's line covered it.
- **The fix and why we chose it:** `activeLine.ts` highlights the current line only while nothing is selected, tested in `activeLine.test.ts`. It was found with the MCP `inspect_elements` tool in the real app.

The toolbar and breadcrumb bugs moved with the bar to [How the path bar works](How-the-Path-Bar-Works.md#bugs-we-fixed).

**The Diff tab could not be closed.**
- **The issue:** the Diff tab always showed a file and had no close button.
- **Why it happened:** it was a fixed tab, and `changesSelection.sync` picked the first changed file on its own.
- **The fix and why we chose it:** the tab shows only while a change is selected, with a close button, and `sync` waits for the user to pick a file.

**Find previous also opened Changes.**
- **The issue:** Shift+Cmd+G in the editor (find previous) also showed Changes, and Shift+Cmd+L also toggled the Log.
- **Why it happened:** the window handler in `Workspace.svelte` ran too, without checking whether the editor had handled the key.
- **The fix and why we chose it:** the pure `workspaceShortcut` skips a key when `event.defaultPrevented` is set, like every window key handler, so inside an editor the editor's action wins.

**A second Save right after the first did nothing.**
- **The issue:** Cmd+S, then a quick edit or Cmd+Z, then Cmd+S again left the tab "Unsaved": the second save never wrote. The features UI test found it.
- **Why it happened:** `FileSave.save` returned at once while a save of the same file was still writing, so a Save pressed during that time was dropped without a word. The browser version, which writes over the network, hit it most.
- **The fix and why we chose it:** the save now waits for the running one (`whenIdle` in `saveQueue.ts`, tested), then writes the newest text. Waiting keeps one write at a time, so two writes can never land out of order.
