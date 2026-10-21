// Runs a menu item: one function per action, reusing what the buttons and window shortcuts
// already do, with the same guards (no workspace action behind a dialog or the merge tool).

import { pickAndStartAgent } from "$lib/ai/sessions.svelte";
import { newTask } from "$lib/ai/panelActions";
import { clearCache } from "$lib/debug/clearCache";
import { tick } from "svelte";
import { errorMessage } from "$lib/api";
import { compareStore } from "$lib/compare/compareStore.svelte";
import { diffLines } from "$lib/diff/diffLines.svelte";
import { focusedEditor, runEditorCommand, runTextEdit } from "$lib/editor/editorCommands";
import { steppedFontSize } from "$lib/editor/wheelZoom";
import { localHistory } from "$lib/localHistory/localHistory.svelte";
import { mcpStore } from "$lib/mcp/mcpStore.svelte";
import { helpDialogs } from "$lib/help/helpDialogs.svelte";
import { fileSearch } from "$lib/search/fileSearchStore.svelte";
import { openShelveDialog, showShelf } from "$lib/shelf/shelfActions.svelte";
import { fileCommands } from "$lib/stores/fileCommands.svelte";
import { isPseudoTab } from "$lib/stores/pseudoTabs";
import { isUntitledTab } from "$lib/stores/untitledTabs";
import { repoStore } from "$lib/stores/repo.svelte";
import { defaultPreferences, type MarkdownViewMode, settings, type ThemeSetting } from "$lib/stores/settings.svelte";
import { terminalStore } from "$lib/terminal/terminalStore.svelte";
import { dialogs } from "$lib/ui/dialog.svelte";
import { toast } from "$lib/ui/toast.svelte";
import { RELEASES_URL, SHORTCUTS_URL, WIKI_URL } from "$lib/update/releases";
import { updates } from "$lib/update/updates.svelte";
import { changesSelection } from "$lib/views/changes/selection.svelte";
import { fetchAll, fetchRemote, focusCommitMessage, push, showLog, stash } from "$lib/views/gitActions";
import { gitDialogs } from "$lib/views/git/gitDialogs.svelte";
import * as gitMenu from "$lib/views/git/gitMenuActions";
import * as bisect from "$lib/views/git/bisectActions";
import { undoLastAction } from "$lib/views/git/undoActions";
import * as lfs from "$lib/views/git/lfs/lfsActions";
import * as submodules from "$lib/views/git/submodules/submoduleActions";
import * as worktrees from "$lib/views/git/worktrees/worktreeActions";
import * as githubActions from "$lib/views/github/githubActions";
import { abortOperation, continueOperation, skipRebaseCommit } from "$lib/views/git/operationActions";
import {
  openNewWindow,
  pickAndAddFolder,
  pickAndOpenInNewWindow,
  pickAndOpenRepo,
  pickAndOpenWorkspaceFile,
  pickAndSaveWorkspace,
} from "$lib/views/repoPicker";
import {
  moveEditorTab,
  openFileSearch,
  openQuickOpen,
  runWorkspaceShortcut,
  shortcutsBlocked,
  splitEditor,
} from "$lib/views/workspaceActions";
import type { WorkspaceShortcut } from "$lib/views/workspaceShortcuts";
import { closeThisWindow } from "$lib/windows/windowActions";
import { type EditorAction, isEditorAction, type MenuAction } from "./menuIds";
import { FOCUSED_GROUP, SHOWN_TAB_CONTENT, TAB_CONTENT } from "$lib/views/workspaceDom";

type Handler = () => unknown;

/** Skipped while an in-app dialog asks something. */
function app(handler: Handler): Handler {
  return () => (dialogs.active === null && gitDialogs.active === null ? handler() : undefined);
}

/** Needs an open workspace, and waits like the window shortcuts behind dialogs, the popup and the merge tool. */
function workspace(handler: Handler): Handler {
  return () => (repoStore.workspace !== null && !shortcutsBlocked() ? handler() : undefined);
}

function shortcut(name: WorkspaceShortcut): Handler {
  return workspace(() => runWorkspaceShortcut(name));
}

/** Needs an active repository that is not busy with another operation. */
function git(handler: Handler): Handler {
  return workspace(() => {
    if (repoStore.repo === null) {
      return undefined;
    }
    // The menu greys these out meanwhile (menuState.ts); a shortcut still lands here, so say why nothing ran.
    if (repoStore.busy !== null) {
      toast.info(`Wait for ${repoStore.busy} to finish`, "Then try again.");
      return undefined;
    }
    return handler();
  });
}

/** The file editor on screen, if any. */
function activeFilePath(): string | null {
  return changesSelection.shownView === "file" ? repoStore.openFilePath : null;
}

/**
 * Undo, Redo, Select All and Delete: CodeMirror keeps its own history, so the editor with
 * the caret runs its command; a text field gets the web view's own editing command; the
 * terminal keeps its keys (Cmd+A is handled there).
 */
function textEdit(edit: "undo" | "redo" | "selectAll" | "delete"): void {
  const editor = focusedEditor();
  if (editor?.inText) {
    runTextEdit(editor.view, edit);
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest(".xterm")) {
    return;
  }
  if (edit === "delete" && !hasSelection(active)) {
    return;
  }
  document.execCommand(edit);
}

function hasSelection(active: Element | null): boolean {
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return (active.selectionStart ?? 0) !== (active.selectionEnd ?? 0);
  }
  return !(document.getSelection()?.isCollapsed ?? true);
}

async function saveAll(): Promise<void> {
  const dirty = repoStore.dirtyPaths;
  const saved = await Promise.all(
    dirty.filter((tabPath) => !isUntitledTab(tabPath)).map((filePath) => fileCommands.save(filePath, { quiet: true })),
  );
  // Each Untitled tab asks where to save, one dialog at a time.
  for (const tabPath of dirty.filter((candidate) => isUntitledTab(candidate))) {
    saved.push(await fileCommands.save(tabPath, { quiet: true }));
  }
  const count = saved.filter(Boolean).length;
  if (count > 0) {
    toast.success(count === 1 ? "Saved 1 file" : `Saved ${count} files`);
  }
}

async function closeTab(): Promise<void> {
  // Cmd+W closes the editor tab on screen in the focused group; with none it does nothing (the window stays).
  const shown = changesSelection.shownView;
  if (shown === "file" && repoStore.openFilePath) {
    await repoStore.closeTab(repoStore.openFilePath, repoStore.focusedGroupId);
  } else if (shown === "diff" && changesSelection.selected) {
    changesSelection.close();
  }
}

/** Focus Next / Previous Group: the group `step` away from the focused one in layout order, going round. */
function nextGroupIndex(step: 1 | -1): number {
  const count = repoStore.groups.length;
  const index = repoStore.groups.findIndex((group) => group.id === repoStore.focusedGroupId);
  return (Math.max(0, index) + step + count) % count;
}

/** Focus First / Second Group (and Next, Previous): the keyboard goes to that group's editor. Second with one group splits. */
async function focusGroupAt(index: number): Promise<void> {
  if (!settings.splitEditor) {
    return;
  }
  if (index > 0 && repoStore.groups.length < 2) {
    splitEditor(activeFilePath(), "right");
    return;
  }
  if (!repoStore.focusGroupAt(index)) {
    return;
  }
  const tabPath = activeFilePath();
  if (tabPath && fileCommands.states[tabPath]) {
    fileCommands.focus(tabPath);
    return;
  }
  // The diff, the Log or another kind of tab: its first text editor, else nothing keeps the old group's focus.
  await tick();
  const group = document.querySelector<HTMLElement>(FOCUSED_GROUP);
  const editor = group?.querySelector<HTMLElement>(
    `${SHOWN_TAB_CONTENT} .cm-content, :scope > :not(${TAB_CONTENT}) .cm-content`,
  );
  if (editor) {
    editor.focus();
  } else if (document.activeElement instanceof HTMLElement && !group?.contains(document.activeElement)) {
    document.activeElement.blur();
  }
}

function setMarkdownMode(mode: MarkdownViewMode): Handler {
  return app(() => {
    const filePath = activeFilePath();
    if (filePath) {
      fileCommands.setViewMode(filePath, mode);
    }
  });
}

function setTheme(theme: ThemeSetting): Handler {
  return app(() => settings.setTheme(theme));
}

function zoom(step: 1 | -1 | 0): Handler {
  return app(() => {
    const size = step === 0 ? defaultPreferences.editorFontSize : steppedFontSize(settings.editorFontSize, step);
    if (size !== settings.editorFontSize) {
      settings.setPreference("editorFontSize", size);
    }
  });
}

function openUrl(url: string): Handler {
  return () => updates.open(url);
}

/** The Find and Code items run in the focused editor instead (editorCommands.ts). */
const HANDLERS: Record<Exclude<MenuAction, EditorAction>, Handler> = {
  "app.about": app(() => settings.openDialog("about")),
  "app.checkForUpdates": app(() => updates.check(true)),
  "app.settings": app(() => settings.openDialog()),

  "file.newWindow": app(() => openNewWindow()),
  "file.openFolder": app(() => pickAndOpenRepo()),
  "file.openFolderNewWindow": app(() => pickAndOpenInNewWindow()),
  "file.openWorkspace": app(() => pickAndOpenWorkspaceFile()),
  "file.clearRecent": app(() => settings.clearRecent()),
  "file.addFolder": workspace(() => pickAndAddFolder()),
  "file.saveWorkspace": workspace(() => pickAndSaveWorkspace()),
  "file.newFile": workspace(() => {
    repoStore.newUntitledTab();
  }),
  "file.save": app(() => {
    const filePath = activeFilePath();
    return filePath ? fileCommands.save(filePath) : undefined;
  }),
  "file.saveAll": app(saveAll),
  "file.revert": app(() => {
    const filePath = activeFilePath();
    return filePath ? fileCommands.revert(filePath) : undefined;
  }),
  "file.compareWithClipboard": workspace(() => {
    const filePath = activeFilePath();
    return filePath ? compareStore.compareWithClipboard(filePath) : undefined;
  }),
  "file.compareWith": workspace(() => {
    const filePath = activeFilePath();
    return filePath ? compareStore.compareWith(filePath) : undefined;
  }),
  "file.localHistory": workspace(() => {
    const filePath = activeFilePath();
    return filePath && !isPseudoTab(filePath) ? localHistory.openFile(filePath) : undefined;
  }),
  "file.recentlyDeleted": workspace(() => localHistory.openDeleted()),
  "file.closeTab": workspace(closeTab),
  "file.reopenClosedTab": workspace(() => repoStore.reopenClosedTab()),
  "file.closeFolder": workspace(() => repoStore.closeWorkspace()),
  "file.closeWindow": app(() => closeThisWindow()),

  // Editing in dialogs must work too: no guard.
  "edit.undo": () => textEdit("undo"),
  "edit.redo": () => textEdit("redo"),
  "edit.delete": () => textEdit("delete"),
  "edit.selectAll": () => textEdit("selectAll"),
  "edit.findInFiles": shortcut("findInFiles"),
  "edit.replaceInFiles": shortcut("replaceInFiles"),
  "edit.goToFile": shortcut("quickOpen"),
  "edit.recentFiles": shortcut("recentFiles"),
  "edit.navigationBar": shortcut("navigationBar"),
  "edit.goToClass": shortcut("goToClass"),
  "edit.goToSymbol": shortcut("goToSymbol"),
  "edit.searchEverywhere": workspace(() => openFileSearch("everywhere")),

  // Works from the welcome screen too (no folder: commands only).
  "view.commandPalette": app(() => openQuickOpen(">")),
  "view.changes": shortcut("showChanges"),
  "view.branches": shortcut("showBranches"),
  "view.scripts": workspace(() => settings.toggleLeftPanel("scripts")),
  "view.log": shortcut("toggleLog"),
  "view.filesPanel": shortcut("toggleExplorer"),
  "view.aiPanel": workspace(() => settings.toggleRightPanel("ai")),
  "view.aiNewTask": workspace(() => {
    const repoRoot = repoStore.repo?.root ?? null;
    if (repoRoot) {
      newTask(repoRoot);
    }
  }),
  "view.aiNewAgent": workspace(() => {
    const folderPath = repoStore.repo?.root ?? repoStore.workspace?.root ?? null;
    if (folderPath) {
      void pickAndStartAgent(folderPath);
    }
  }),
  "view.sidebar": shortcut("toggleSidebar"),
  "view.leftActivityBar": workspace(() => settings.toggleActivityBar("left")),
  "view.rightActivityBar": workspace(() => settings.toggleActivityBar("right")),
  "view.terminal": shortcut("toggleTerminal"),
  "view.gitConsole": workspace(() => terminalStore.toggleTab("gitConsole")),
  "view.wordWrap": app(() => settings.toggleWordWrap()),
  "view.stickyScroll": app(() => settings.setPreference("editorStickyScroll", !settings.editorStickyScroll)),
  "view.minimap": app(() => settings.setPreference("editorMinimap", !settings.editorMinimap)),
  "view.fileIconsOff": app(() => settings.setPreference("fileIcons", "off")),
  "view.fileIconsMinimal": app(() => settings.setPreference("fileIcons", "minimal")),
  "view.fileIconsMaterial": app(() => settings.setPreference("fileIcons", "material")),
  "view.detectIndentation": app(() => settings.setPreference("detectIndentation", !settings.detectIndentation)),
  "view.notifications": workspace(() => settings.toggleRightPanel("notifications")),
  "view.doNotDisturb": app(() =>
    settings.setPreference("notificationsDoNotDisturb", !settings.notificationsDoNotDisturb),
  ),
  "view.clearCache": app(() => void clearCache()),
  "view.markdownEditor": setMarkdownMode("editor"),
  "view.markdownSplit": setMarkdownMode("split"),
  "view.markdownPreview": setMarkdownMode("preview"),
  "view.themeLight": setTheme("light"),
  "view.themeDark": setTheme("dark"),
  "view.themeSystem": setTheme("system"),
  "view.zoomIn": zoom(1),
  "view.zoomOut": zoom(-1),
  "view.zoomReset": zoom(0),

  // The Git menu, for the active repository; the Current File items act on the file on screen.
  "git.commit": git(() => focusCommitMessage(repoStore.repo?.root)),
  "git.push": git(() => gitMenu.openPushDialog()),
  // Asks first, then pushes with --force-with-lease.
  "git.forcePush": git(() => push(true)),
  "git.updateProject": workspace(() => (repoStore.busy === null ? gitDialogs.open({ kind: "update" }) : undefined)),
  "git.pull": git(() => gitMenu.openPullDialog()),
  "git.fetchCurrent": git(() => fetchRemote()),
  "git.fetch": git(() => fetchAll()),
  "git.merge": git(() => gitMenu.mergeFromMenu()),
  "git.rebase": git(() => gitMenu.rebaseFromMenu()),
  "git.interactiveRebase": git(() => gitMenu.interactiveRebaseFromMenu()),
  "git.branches": git(() => gitMenu.branchesFromMenu()),
  "git.newBranch": git(() => gitMenu.newBranchFromMenu()),
  "git.newTag": git(() => gitMenu.newTagFromMenu()),
  "git.resetHead": git(() => gitMenu.openResetDialog()),
  "git.undoLast": git(() => undoLastAction()),
  "git.resolveConflicts": git(() => repoStore.openConflicts()),
  "git.continueOp": git(() => continueOperation()),
  "git.abortOp": git(() => abortOperation()),
  "git.skipCommit": git(() => skipRebaseCommit()),
  "git.showLog": workspace(() => showLog()),
  "git.showConsole": workspace(() => terminalStore.showTab("gitConsole")),
  "git.showReflog": workspace(() => gitMenu.showReflog()),
  "git.bisect.start": git(() => bisect.startBisect()),
  "git.bisect.good": git(() => bisect.markBisect("good")),
  "git.bisect.bad": git(() => bisect.markBisect("bad")),
  "git.bisect.skip": git(() => bisect.markBisect("skip")),
  "git.bisect.reset": git(() => bisect.resetBisect()),
  "git.patch.create": git(() => gitMenu.createPatchFromChanges()),
  "git.patch.createFromCommit": git(() => gitMenu.createPatchFromCommit()),
  "git.patch.apply": git(() => gitMenu.applyPatchFromFile()),
  "git.patch.applyClipboard": git(() => gitMenu.applyPatchFromClipboard()),
  "git.stash": git(() => stash()),
  "git.unstash": git(() => gitMenu.unstashFromMenu()),
  "git.shelve": git(() => openShelveDialog()),
  "git.showShelf": workspace(() => showShelf()),
  "git.rollback": git(() => gitMenu.openRollbackDialog()),
  "git.showLocalChanges": workspace(() => gitMenu.showLocalChanges()),
  // The selection of the Changes diff on screen (DiffView); nothing without one.
  "git.lines.stage": git(() => diffLines.run("stage")),
  "git.lines.unstage": git(() => diffLines.run("unstage")),
  "git.lines.discard": git(() => diffLines.run("discard")),
  "git.file.commit": git(() => gitMenu.commitCurrentFile()),
  "git.file.add": git(() => gitMenu.addCurrentFile()),
  "git.file.annotate": workspace(() => gitMenu.toggleAnnotate()),
  "git.file.showDiff": workspace(() => gitMenu.showCurrentFileDiff()),
  "git.file.compareRevision": workspace(() => gitMenu.compareCurrentFileWithRevision()),
  "git.file.compareBranch": workspace(() => gitMenu.compareCurrentFileWithBranch()),
  "git.file.history": workspace(() => gitMenu.showCurrentFileHistory()),
  "git.file.historySelection": workspace(() => gitMenu.showSelectionHistory()),
  "git.file.rollback": git(() => gitMenu.rollbackCurrentFile()),
  "git.worktree.new": git(() => worktrees.openNewWorktreeDialog()),
  "git.worktree.show": workspace(() => worktrees.showWorktrees()),
  "git.worktree.prune": git(() => worktrees.pruneWorktrees()),
  "git.submodule.init": git(() => submodules.initSubmodules()),
  "git.submodule.update": git(() => submodules.updateSubmodules()),
  "git.submodule.updateRemote": git(() => submodules.updateSubmodules(undefined, true)),
  "git.submodule.sync": git(() => submodules.syncSubmodules()),
  "git.submodule.add": git(() => submodules.openAddSubmoduleDialog()),
  "git.submodule.remove": git(() => submodules.removeSubmoduleFromMenu()),
  "git.submodule.open": workspace(() => submodules.openSubmoduleFromMenu()),
  "git.lfs.track": git(() => lfs.trackPattern()),
  "git.lfs.untrack": git(() => lfs.untrackPattern()),
  "git.lfs.pull": git(() => lfs.transferObjects(undefined, true)),
  "git.lfs.fetch": git(() => lfs.transferObjects(undefined, false)),
  "git.lfs.prune": git(() => lfs.pruneObjects()),
  "git.lfs.install": git(() => lfs.installHooks()),
  "git.manageRemotes": git(() => gitMenu.openRemotesDialog()),
  "git.openRemote": workspace(() => gitMenu.openRemoteInBrowser()),
  // Works from the welcome screen too.
  "git.clone": app(() => (fileSearch.isOpen ? undefined : gitMenu.openCloneDialog())),
  "git.github.open": workspace(() => gitMenu.openOnGitHub()),
  "git.github.createPullRequest": workspace(() => gitMenu.createPullRequest()),
  "git.github.pullRequests": workspace(() => gitMenu.viewPullRequests()),
  "git.github.copyLink": workspace(() => gitMenu.copyGitHubLink()),
  "git.github.share": git(() => githubActions.shareProjectOnGitHub()),
  "git.github.syncFork": git(() => githubActions.syncFork()),
  "git.github.createGist": workspace(() => githubActions.createGist()),
  "git.cherryPick": git(() => gitMenu.cherryPickFromMenu()),

  "window.nextTab": shortcut("nextTab"),
  "window.previousTab": shortcut("previousTab"),
  "window.pinTab": workspace(() => {
    const tabPath = activeFilePath();
    if (tabPath) {
      repoStore.setTabPinned(tabPath, !repoStore.isPinned(tabPath));
    }
  }),
  "window.splitRight": workspace(() => splitEditor(activeFilePath(), "right")),
  "window.splitDown": workspace(() => splitEditor(activeFilePath(), "down")),
  "window.moveTabToOtherGroup": workspace(() => {
    const tabPath = activeFilePath();
    if (tabPath) {
      moveEditorTab(tabPath);
    }
  }),
  "window.focusLeftGroup": workspace(() => focusGroupAt(0)),
  "window.focusRightGroup": workspace(() => focusGroupAt(1)),
  "window.focusNextGroup": workspace(() => focusGroupAt(nextGroupIndex(1))),
  "window.focusPreviousGroup": workspace(() => focusGroupAt(nextGroupIndex(-1))),
  "window.closeGroup": workspace(() => repoStore.closeGroup()),

  "help.docs": openUrl(WIKI_URL),
  "help.shortcuts": app(() => helpDialogs.openShortcuts()),
  "help.whatsNew": app(() => {
    updates.whatsNewOpen = true;
  }),
  "help.releaseNotes": openUrl(RELEASES_URL),
  "help.mcpTools": app(() => mcpStore.openToolsDialog()),
  "help.reportBug": () => updates.reportBug(),
  "help.requestFeature": () => updates.requestFeature(),
  "help.star": () => updates.openRepository(),
};

/** Runs a menu item; editor items act on the focused editor and do nothing without one. */
export function runMenuAction(action: MenuAction): void {
  if (isEditorAction(action)) {
    runEditorCommand(action);
    return;
  }
  Promise.resolve()
    .then(HANDLERS[action])
    .catch((error: unknown) => toast.error("The menu command failed", errorMessage(error)));
}
