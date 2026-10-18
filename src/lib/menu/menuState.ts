// Which menu items are enabled, checked or renamed for the current app state. Pure:
// appMenu.svelte.ts gathers the inputs and sends only what changed to the native menu.

import type { FileIconMode, LeftPanel, MarkdownViewMode, ThemeSetting } from "$lib/stores/settingsData";
import type { OpKind } from "$lib/types";
import type { MenuAction, MenuMode } from "./menuIds";

export interface MenuInputs {
  mode: MenuMode;
  workspace: { folderCount: number } | null;
  /** The active repository, if any, with how far its branch is ahead of and behind its upstream. */
  repo: GitRepoInputs | null;
  /** The file editor tab on screen, when the file is inside a repository (the Current File submenu). */
  gitFile: GitFileInputs | null;
  /** Blame gutter preference (Annotate with Git Blame). */
  blameGutter: boolean;
  shownView: "diff" | "log" | "file" | "none";
  /** The file editor on screen; null for other tabs and views. */
  /** `untitled`: an Untitled tab (File > New File), which has no file to compare or a history. */
  activeFile: { dirty: boolean; editable: boolean; markdownMode: MarkdownViewMode | null; untitled?: boolean } | null;
  dirtyCount: number;
  tabCount: number;
  /** Closed tabs Reopen Closed Tab can bring back. */
  closedTabCount?: number;
  /** The tab on screen is pinned (Pin Tab becomes Unpin Tab). */
  activeTabPinned?: boolean;
  /** The Log is on screen (in the first editor group), whichever group has the focus. */
  logShown?: boolean;
  /** Editor groups (Window > Split Right / Split Down); missing means one group with splitting off. */
  editorGroups?: EditorGroupInputs;
  leftPanel: LeftPanel;
  explorerOpen: boolean;
  /** The right sidebar shows the AI panel. */
  aiPanelOpen?: boolean;
  leftBarVisible: boolean;
  rightBarVisible: boolean;
  terminalOpen: boolean;
  /** The bottom panel shows the Git Console. */
  gitConsoleOpen?: boolean;
  /** The Git Console setting; off hides its menu items. */
  gitConsoleEnabled?: boolean;
  theme: ThemeSetting;
  /** Word wrap in the file editor. */
  wordWrap: boolean;
  /** Sticky scroll and the minimap of the file editor (Settings > Editor). */
  stickyScroll?: boolean;
  minimap?: boolean;
  /** Settings > Appearance > File icons. */
  fileIcons?: FileIconMode;
  /** Settings > Editor > Detect indentation. */
  detectIndentation?: boolean;
  /** Do Not Disturb (only errors pop up). */
  doNotDisturb?: boolean;
  /** The right sidebar shows the Notifications panel. */
  notificationsOpen?: boolean;
  /**
   * The Changes diff that offers line actions: "unstaged" (Stage and Discard Selected Lines)
   * or "staged" (Unstage); null or missing without one.
   */
  diffLines?: "unstaged" | "staged" | null;
  editor: {
    /** Focus is in a CodeMirror editor, its find bar included. */
    focused: boolean;
    /** The caret is in the editor's text. */
    inText: boolean;
    writable: boolean;
  };
  hasRecent: boolean;
}

export interface EditorGroupInputs {
  /** Settings > Editor > Split editor. */
  enabled: boolean;
  count: number;
  /** Index of the focused group in layout order (left to right, top to bottom). */
  focusedIndex: number;
  /** Split Right / Split Down can open the tab on screen in a new group. */
  canSplit: boolean;
}

export interface GitRepoInputs {
  busy: boolean;
  ahead: number;
  behind: number;
  /** The current branch, null when detached. */
  branch: string | null;
  unborn: boolean;
  op: OpKind;
  conflicts: number;
  /** Changed files, untracked ones included. */
  changes: number;
  remotes: number;
  /** A remote points to github.com. */
  github: boolean;
  /** A `git bisect` is in progress. */
  bisecting: boolean;
  /** Distinct web pages of the remotes (Open Repository in Browser). */
  remoteLinks: number;
}

export interface GitFileInputs {
  busy: boolean;
  /** Staged or unstaged changes, untracked included. */
  changed: boolean;
  untracked: boolean;
  /** Unstaged changes or untracked: Add to Git has something to stage. */
  unstaged: boolean;
  conflicted: boolean;
  /** An editor selection or caret line exists (Show History for Selection). */
  hasEditor: boolean;
}

export interface ItemState {
  enabled: boolean;
  checked?: boolean;
  text?: string;
  /** False removes the item from the menu (operation items, GitHub); undefined means always shown. */
  visible?: boolean;
}

export type MenuState = Partial<Record<MenuAction, ItemState>>;

/** An entry shown while any of `dependsOn` is visible (null: always), in the native menu and the page's. */
export function isShown(dependsOn: MenuAction[] | null, state: MenuState): boolean {
  return dependsOn === null || dependsOn.some((action) => state[action]?.visible ?? true);
}

const FIND_ACTIONS = [
  "edit.find",
  "edit.replace",
  "edit.findNext",
  "edit.findPrevious",
  "edit.selectAllOccurrences",
] as const satisfies readonly MenuAction[];

/** Code menu items that change the text; the others also work in read-only editors. */
const EDITING_CODE_ACTIONS = [
  "code.lineComment",
  "code.blockComment",
  "code.duplicate",
  "code.deleteLine",
  "code.joinLines",
  "code.moveLineUp",
  "code.moveLineDown",
  "code.indent",
  "code.unindent",
  "code.toggleCase",
  "code.sortLines",
] as const satisfies readonly MenuAction[];

const READING_CODE_ACTIONS = [
  "code.expand",
  "code.collapse",
  "code.expandAll",
  "code.collapseAll",
  "code.goToLine",
  "code.selectNextOccurrence",
] as const satisfies readonly MenuAction[];

const MARKDOWN_ITEMS: [MenuAction, MarkdownViewMode][] = [
  ["view.markdownEditor", "editor"],
  ["view.markdownSplit", "split"],
  ["view.markdownPreview", "preview"],
];

const FILE_ICON_ITEMS: [MenuAction, FileIconMode][] = [
  ["view.fileIconsOff", "off"],
  ["view.fileIconsMinimal", "minimal"],
  ["view.fileIconsMaterial", "material"],
];

const THEME_ITEMS: [MenuAction, ThemeSetting][] = [
  ["view.themeLight", "light"],
  ["view.themeDark", "dark"],
  ["view.themeSystem", "system"],
];

export function menuState(inputs: MenuInputs): MenuState {
  const state: MenuState = {};
  const { editor } = inputs;
  for (const action of FIND_ACTIONS) {
    state[action] = { enabled: editor.focused };
  }
  if (inputs.mode === "mergeTool") {
    return state;
  }
  const workspace = inputs.workspace !== null;
  const file = inputs.activeFile;

  state["file.newFile"] = { enabled: workspace };
  state["file.clearRecent"] = { enabled: inputs.hasRecent };
  state["file.addFolder"] = { enabled: workspace };
  state["file.saveWorkspace"] = { enabled: workspace };
  state["file.save"] = { enabled: file !== null && file.editable && file.dirty };
  state["file.saveAll"] = { enabled: inputs.dirtyCount > 0 };
  state["file.revert"] = { enabled: file !== null && file.editable };
  const onDisk = file !== null && file.untitled !== true;
  state["file.compareWithClipboard"] = { enabled: workspace && onDisk };
  state["file.compareWith"] = { enabled: workspace && onDisk };
  // A deleted file's tab still shows its versions (and offers Restore).
  state["file.localHistory"] = { enabled: workspace && onDisk };
  state["file.recentlyDeleted"] = { enabled: workspace };
  state["file.closeTab"] = { enabled: workspace && (inputs.shownView === "file" || inputs.shownView === "diff") };
  state["file.reopenClosedTab"] = { enabled: workspace && (inputs.closedTabCount ?? 0) > 0 };
  state["file.closeFolder"] = {
    enabled: workspace,
    text: (inputs.workspace?.folderCount ?? 0) > 1 ? "Close Workspace" : "Close Folder",
  };

  for (const action of [
    "edit.findInFiles",
    "edit.replaceInFiles",
    "edit.goToFile",
    "edit.recentFiles",
    "edit.navigationBar",
    "edit.goToClass",
    "edit.goToSymbol",
    "edit.searchEverywhere",
  ] as const) {
    state[action] = { enabled: workspace };
  }

  state["view.changes"] = { enabled: workspace, checked: workspace && inputs.leftPanel === "changes" };
  state["view.branches"] = { enabled: workspace, checked: workspace && inputs.leftPanel === "branches" };
  state["view.scripts"] = { enabled: workspace, checked: workspace && inputs.leftPanel === "scripts" };
  state["view.log"] = { enabled: workspace, checked: workspace && (inputs.logShown ?? inputs.shownView === "log") };
  state["view.filesPanel"] = { enabled: workspace, checked: workspace && inputs.explorerOpen };
  state["view.aiPanel"] = { enabled: workspace, checked: workspace && (inputs.aiPanelOpen ?? false) };
  state["view.aiNewAgent"] = { enabled: workspace };
  state["view.aiNewTask"] = { enabled: workspace && inputs.repo !== null };
  state["view.sidebar"] = { enabled: workspace, checked: workspace && inputs.leftPanel !== null };
  state["view.leftActivityBar"] = { enabled: workspace, checked: workspace && inputs.leftBarVisible };
  state["view.rightActivityBar"] = { enabled: workspace, checked: workspace && inputs.rightBarVisible };
  state["view.terminal"] = { enabled: workspace, checked: workspace && inputs.terminalOpen };
  const gitConsole = inputs.gitConsoleEnabled ?? true;
  state["view.gitConsole"] = {
    enabled: workspace && gitConsole,
    checked: workspace && gitConsole && (inputs.gitConsoleOpen ?? false),
    visible: gitConsole,
  };
  state["git.showConsole"] = { enabled: workspace && gitConsole, visible: gitConsole };
  for (const [action, mode] of MARKDOWN_ITEMS) {
    const markdownMode = file?.markdownMode ?? null;
    state[action] = { enabled: markdownMode !== null, checked: markdownMode === mode };
  }
  state["view.wordWrap"] = { enabled: true, checked: inputs.wordWrap };
  state["view.stickyScroll"] = { enabled: true, checked: inputs.stickyScroll ?? false };
  state["view.minimap"] = { enabled: true, checked: inputs.minimap ?? false };
  for (const [action, mode] of FILE_ICON_ITEMS) {
    state[action] = { enabled: true, checked: (inputs.fileIcons ?? "off") === mode };
  }
  state["view.detectIndentation"] = { enabled: true, checked: inputs.detectIndentation ?? false };
  state["view.notifications"] = { enabled: workspace, checked: workspace && (inputs.notificationsOpen ?? false) };
  state["view.doNotDisturb"] = { enabled: true, checked: inputs.doNotDisturb ?? false };
  state["view.clearCache"] = { enabled: true };
  for (const [action, theme] of THEME_ITEMS) {
    state[action] = { enabled: true, checked: inputs.theme === theme };
  }

  for (const action of EDITING_CODE_ACTIONS) {
    state[action] = { enabled: editor.inText && editor.writable };
  }
  for (const action of READING_CODE_ACTIONS) {
    state[action] = { enabled: editor.inText };
  }

  Object.assign(state, gitMenuState(inputs.repo, inputs.gitFile, inputs.blameGutter));
  const lines = inputs.shownView === "diff" ? (inputs.diffLines ?? null) : null;
  const linesReady = inputs.repo !== null && !inputs.repo.busy;
  state["git.lines.stage"] = { enabled: linesReady && lines === "unstaged" };
  state["git.lines.discard"] = { enabled: linesReady && lines === "unstaged" };
  state["git.lines.unstage"] = { enabled: linesReady && lines === "staged" };
  // Create Gist works on any file editor, inside a repository or not.
  state["git.github.createGist"] = { enabled: inputs.repo !== null && file !== null };

  state["window.nextTab"] = { enabled: inputs.tabCount > 0 };
  state["window.previousTab"] = { enabled: inputs.tabCount > 0 };
  state["window.pinTab"] = {
    enabled: workspace && inputs.shownView === "file" && inputs.tabCount > 0,
    text: inputs.activeTabPinned ? "Unpin Tab" : "Pin Tab",
  };
  const groups = inputs.editorGroups ?? { enabled: false, count: 1, focusedIndex: 0, canSplit: false };
  const grouping = workspace && groups.enabled;
  state["window.splitRight"] = { enabled: grouping && groups.canSplit };
  state["window.splitDown"] = { enabled: grouping && groups.canSplit };
  state["window.moveTabToOtherGroup"] = { enabled: grouping && inputs.shownView === "file" && inputs.tabCount > 0 };
  state["window.focusLeftGroup"] = { enabled: grouping && groups.count > 1 && groups.focusedIndex !== 0 };
  // With one group it splits the tab on screen to the right.
  state["window.focusRightGroup"] = {
    enabled: grouping && (groups.count > 1 ? groups.focusedIndex !== 1 : groups.canSplit),
  };
  state["window.focusNextGroup"] = { enabled: grouping && groups.count > 1 };
  state["window.focusPreviousGroup"] = { enabled: grouping && groups.count > 1 };
  state["window.closeGroup"] = { enabled: grouping && groups.count > 1 };
  // Works from the welcome screen too, with the server on or off.
  state["help.mcpTools"] = { enabled: true };
  return state;
}

const OPERATION_NAMES: Partial<Record<OpKind, string>> = {
  merge: "Merge",
  rebase: "Rebase",
  cherryPick: "Cherry-Pick",
  revert: "Revert",
};

/** The Git menu: what needs a repository, a branch, a remote, an operation or a current file. */
export function gitMenuState(
  repo: GitRepoInputs | null,
  gitFile: GitFileInputs | null,
  blameGutter: boolean,
): MenuState {
  const state: MenuState = {};
  const ready = repo !== null && !repo.busy;
  const operation = repo?.op ?? "none";
  const inOperation = operation !== "none";
  const hasBranch = ready && repo.branch !== null && !repo.unborn;
  const hasRemote = ready && repo.remotes > 0;
  const hasCommits = ready && !repo.unborn;

  state["git.commit"] = { enabled: ready };
  state["git.push"] = {
    enabled: hasBranch && hasRemote && !inOperation,
    text: `${countLabel("Push", repo?.ahead ?? 0, "ahead")}...`,
  };
  state["git.forcePush"] = { enabled: hasBranch && hasRemote && !inOperation };
  state["git.pull"] = {
    enabled: hasBranch && hasRemote && !inOperation,
    text: `${countLabel("Pull", repo?.behind ?? 0, "behind")}...`,
  };
  state["git.updateProject"] = { enabled: repo !== null && !repo.busy };
  state["git.fetchCurrent"] = { enabled: hasRemote };
  state["git.fetch"] = { enabled: hasRemote };
  for (const action of ["git.merge", "git.cherryPick"] as const) {
    state[action] = { enabled: hasCommits && !inOperation };
  }
  state["git.rebase"] = { enabled: hasBranch && !inOperation };
  state["git.interactiveRebase"] = { enabled: hasBranch && !inOperation };
  state["git.branches"] = { enabled: ready };
  state["git.newBranch"] = { enabled: hasCommits };
  state["git.newTag"] = { enabled: hasCommits };
  state["git.resetHead"] = { enabled: hasCommits && !inOperation };
  const bisecting = repo?.bisecting ?? false;
  state["git.undoLast"] = { enabled: ready && !inOperation && !bisecting };
  state["git.bisect.start"] = { enabled: hasCommits && !inOperation && !bisecting };
  for (const action of ["git.bisect.good", "git.bisect.bad", "git.bisect.skip", "git.bisect.reset"] as const) {
    state[action] = { enabled: ready && bisecting };
  }

  // Shown only while they apply, named after the operation.
  const name = OPERATION_NAMES[operation] ?? null;
  const conflicts = repo?.conflicts ?? 0;
  state["git.resolveConflicts"] = { enabled: ready && conflicts > 0, visible: conflicts > 0 };
  state["git.continueOp"] = {
    enabled: ready && name !== null && conflicts === 0,
    visible: name !== null,
    text: name ? `Continue ${name}` : "Continue",
  };
  state["git.abortOp"] = {
    enabled: ready && name !== null,
    visible: name !== null,
    text: name ? `Abort ${name}` : "Abort",
  };
  state["git.skipCommit"] = { enabled: ready, visible: operation === "rebase" };

  state["git.showLog"] = { enabled: repo !== null };
  state["git.showReflog"] = { enabled: repo !== null && !repo.unborn };
  state["git.patch.create"] = { enabled: hasCommits && (repo?.changes ?? 0) > 0 };
  state["git.patch.createFromCommit"] = { enabled: hasCommits };
  state["git.patch.apply"] = { enabled: ready };
  state["git.patch.applyClipboard"] = { enabled: ready };
  state["git.stash"] = { enabled: hasCommits && (repo?.changes ?? 0) > 0 };
  state["git.unstash"] = { enabled: ready };
  state["git.shelve"] = { enabled: ready && (repo?.changes ?? 0) > 0 };
  state["git.showShelf"] = { enabled: repo !== null };
  state["git.rollback"] = { enabled: ready && (repo?.changes ?? 0) > 0 };
  state["git.showLocalChanges"] = { enabled: repo !== null };

  const file = gitFile;
  const fileReady = file !== null && !file.busy;
  const versioned = file !== null && !file.untracked;
  state["git.file.commit"] = { enabled: fileReady && file.changed && !file.conflicted };
  state["git.file.add"] = { enabled: fileReady && file.unstaged };
  state["git.file.annotate"] = { enabled: versioned, checked: versioned && blameGutter };
  state["git.file.showDiff"] = { enabled: file !== null && file.changed };
  state["git.file.compareRevision"] = { enabled: versioned };
  state["git.file.compareBranch"] = { enabled: versioned };
  state["git.file.history"] = { enabled: versioned };
  state["git.file.historySelection"] = { enabled: versioned && file.hasEditor };
  state["git.file.rollback"] = { enabled: fileReady && file.changed && !file.untracked && !file.conflicted };

  state["git.manageRemotes"] = { enabled: ready };
  state["git.openRemote"] = { enabled: (repo?.remoteLinks ?? 0) > 0 };
  for (const action of [
    "git.worktree.new",
    "git.worktree.prune",
    "git.submodule.init",
    "git.submodule.update",
    "git.submodule.updateRemote",
    "git.submodule.sync",
    "git.submodule.add",
    "git.submodule.remove",
    "git.lfs.track",
    "git.lfs.untrack",
    "git.lfs.pull",
    "git.lfs.fetch",
    "git.lfs.prune",
    "git.lfs.install",
  ] as const) {
    state[action] = { enabled: ready && !inOperation };
  }
  state["git.worktree.show"] = { enabled: repo !== null };
  state["git.submodule.open"] = { enabled: repo !== null };
  state["git.clone"] = { enabled: true };
  const github = repo?.github ?? false;
  // The submenu shows for every repository: Share Project is for one without a GitHub remote.
  state["git.github.share"] = { enabled: ready && !github, visible: repo !== null };
  state["git.github.syncFork"] = { enabled: ready && github };
  state["git.github.open"] = { enabled: github };
  state["git.github.createPullRequest"] = { enabled: github && repo?.branch !== null };
  state["git.github.pullRequests"] = { enabled: github };
  state["git.github.copyLink"] = { enabled: github && file !== null };
  return state;
}

/** "Pull (2 behind)", or just "Pull" when there is nothing to pull. */
export function countLabel(label: string, count: number, word: string): string {
  return count > 0 ? `${label} (${count} ${word})` : label;
}

/** The parts of `next` that differ from what the menu shows (`shown`). */
export function changedState(
  shown: ReadonlyMap<MenuAction, ItemState>,
  next: MenuState,
): [MenuAction, Partial<ItemState>][] {
  const changes: [MenuAction, Partial<ItemState>][] = [];
  for (const [action, wanted] of Object.entries(next) as [MenuAction, ItemState][]) {
    const current = shown.get(action);
    const diff: Partial<ItemState> = {};
    if (current?.enabled !== wanted.enabled) {
      diff.enabled = wanted.enabled;
    }
    if (wanted.checked !== undefined && current?.checked !== wanted.checked) {
      diff.checked = wanted.checked;
    }
    if (wanted.text !== undefined && current?.text !== wanted.text) {
      diff.text = wanted.text;
    }
    if (wanted.visible !== undefined && (current?.visible ?? true) !== wanted.visible) {
      diff.visible = wanted.visible;
    }
    if (Object.keys(diff).length > 0) {
      changes.push([action, diff]);
    }
  }
  return changes;
}
