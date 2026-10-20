# How reverting a change works

This chapter explains the Revert button on each change of the Changes diff and in the file editor's change peek. The user side is in [Revert a Change](../usage/Revert-a-Change.md). The diff itself is in [How Diffs Work](How-Diffs-Work.md) and [How the inline diff works](How-the-Inline-Diff-Works.md); the editor and its change bars are in [How the Editor Works](How-the-Editor-Works.md).

## Why we need it

Staging one change was already one click, but throwing one away meant selecting its lines and running Discard Selected Lines, or editing by hand. A revert action on every change is common, and users expect it in both the diff and the editor.

## How it works

Both compare the index with the newer text, but the Changes diff reverts the file on disk while the editor changes its own unsaved text. So they take two paths.

```mermaid
flowchart TD
  A[Revert button on a diff change] --> B[revertChange.ts: the change's old and new lines]
  B --> C[DiffView: onLines discard, wholeChange]
  C --> D[changesSelection.applyLines: confirm Revert Change]
  D --> E[apply_selected_lines: version check, reverse patch on the work tree]
  E --> F[Toast with Undo: restore_discarded_lines]
  G[Revert in the editor's change peek] --> H[FilePeek.revert]
  H --> I[confirm Revert Change]
  I --> J[the peek's readBaseFile and diffLines, text unchanged]
  J --> K[revertLines.ts: revertEdit]
  K --> L[One editor transaction, undoable]
```

### In the Changes diff

Side by side, `DiffFrame` takes `onrevert` and `revertTitle` and passes them to `MergeConnector`, which draws a button with the `discard` icon on each band, on the far side of the Stage arrow (where the merge tool's Ignore button goes). `DiffEditors.changeLines(index)` turns the `MergeView` chunk into line ranges with `chunkSelection`. A chunk's `to` is one past its last line break and may point past the end of the text, so `chunkLines` clamps it.

Inline, `inlineView.ts` adds a second button after Stage in the control gutter. Each block already carries its backend hunk, so `hunkSelection` reads the lines straight from it.

Both end in `onLines("discard", lines, true)`, the Discard Selected Lines path in `changesSelection.applyLines`. The backend checks the diff's `version`, so a file that changed since the diff was shown is refused, and the Undo in the toast applies the saved patch again. `wholeChange` only changes the confirm's words to Revert Change. Revert is offered only in unstaged mode: a staged diff has Unstage, which already moves a change back.

### In the Changes tab, a commit and a compare

These diffs are read-only, so `DiffView` takes `onRevert` (and `onApply` for a commit or a branch compare) instead of line actions: the same buttons side by side, and inline Apply then Revert in the control gutter. [One diff view](One-Diff-View.md) explains how `GitDiffView` picks the revisions; `changeWorkTree` (`diff/diffActions.ts`) confirms a Revert and calls `apply_revision_lines`, which patches the work tree file only, after a local history snapshot, and returns the patch for Undo.

### In the editor

A click on a change bar opens the change peek ([How the change peek works](How-the-Change-Peek-Works.md)), which has already read the index version (`readBaseFile`) and diffed it with the text (`diffLines`). Its **Revert this change** calls `FilePeek.revert`, which:

1. Confirms with a danger dialog.
2. Checks that the text is still the one the peek diffed, as any edit closes the peek.
3. Dispatches the edit from `revertEdit` as one transaction with `userEvent: "input.revert"`, then opens the peek on the change that takes its place.

## Where the code lives

| File | What it does |
| --- | --- |
| `ui/web/src/lib/components/MergeConnector.svelte`, `DiffFrame.svelte` | The Revert button on each band (UI library) |
| `src/lib/diff/revertChange.ts` | A chunk's or a hunk's lines as a `LineSelection` |
| `src/lib/diff/inlineView.ts` | The inline Revert button after Stage |
| `src/lib/diff/DiffView.svelte`, `diffEditors.svelte.ts` | Wiring the buttons to `onLines` |
| `src/lib/views/changes/selection.svelte.ts` | `applyLines`, the confirm and the Undo toast |
| `src/lib/diff/diffActions.ts`, `src-tauri/src/commands/revision_lines.rs` | Revert and Apply between two revisions, or a revision and the work tree |
| `src/lib/editor/scrollMarkers.ts` | `changeGutter` and its bar click |
| `src/lib/editor/revertLines.ts` | `changeAtLine` and `revertEdit` |
| `src/lib/views/files/changePeek/filePeek.ts` | `revert` for the editor's change peek |

## Design decisions

**Reuse Discard Selected Lines in the diff.** It already checks the version, keeps the patch for Undo and serializes with staging. Copying a chunk in the editors (as Stage does) would need a write of the work tree file, which the diff never does.

**Edit the buffer in the editor, not the file.** The editor may hold unsaved text the disk does not have. An editor transaction keeps undo, auto save and the dirty state working as for typing.

**Diff again on click.** The bars come from the backend and may be up to 200 ms old. The peek diffs the index version with the text of that moment, so the revert always matches what is there. Past `MAX_EDITS` the diff is one big change, so the whole range reverts.

**Always confirm.** Reverting loses work, and a click on a 5 pixel bar is easy to make by mistake.

## Tests

- `src/lib/diff/revertChange.test.ts`: a chunk's and a hunk's lines, empty sides, a last line without a break.
- `src/lib/editor/revertLines.test.ts`: the change on a clicked line, and reverting changed, added and deleted lines at the start, middle and end.
- The backend paths are covered by the `apply_selected_lines` tests in `commands/lines.rs` and the `apply_revision_lines` tests in `commands/revision_lines.rs`: only the picked change goes back or comes in, Undo reverses it, and a staged version stays in the index.

The buttons, the hand pointer and the confirms need a check in the app. See [Testing](Testing.md).

## Bugs we fixed

**The Changes tab had no Revert button.**
- **The issue:** the Changes tab (status bar > **N changes**) showed changes with no way to revert one, side by side or inline.
- **Why it happened:** Revert came from Discard Selected Lines, which works on the index against the work tree, and the tab compares with HEAD in a read-only diff.
- **The fix and why we chose it:** a backend action reverts against HEAD, with the same checks, local history snapshot and Undo patch as Discard, and `DiffView`'s `onRevert` shows the usual buttons in a read-only diff. It became `apply_revision_lines` when commits got Revert and Apply.

**Commit diffs had no Revert, Apply or three columns.**
- **The issue:** the History panel and commit tabs showed a commit's diff with no buttons, and only merge commits could show three columns, while the Changes diff had both.
- **Why it happened:** every place chose its own panes and buttons around `DiffView` and `ThreePaneDiff`, so features added in one place never reached the others.
- **The fix and why we chose it:** one `GitDiffView` for every place (see [One diff view](One-Diff-View.md)), with a `DiffSource` that decides the panes and buttons, so a new button reaches every diff at once.

## Keeping this page in sync

- Update this page when the Revert buttons move, when `applyLines` or `changeGutter` change, or when the editor's bars compare with something other than HEAD.
