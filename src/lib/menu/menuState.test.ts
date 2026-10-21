import { describe, expect, it } from "vitest";
import type { MenuAction } from "./menuIds";
import { actionEntries, menuSpec } from "./menuSpec";
import {
  changedState,
  countLabel,
  type GitFileInputs,
  type GitRepoInputs,
  gitMenuState,
  type ItemState,
  type MenuInputs,
  menuState,
} from "./menuState";

const repo: GitRepoInputs = {
  busy: false,
  ahead: 0,
  behind: 0,
  branch: "main",
  unborn: false,
  op: "none",
  conflicts: 0,
  changes: 2,
  remotes: 1,
  github: false,
  bisecting: false,
  remoteLinks: 0,
};

const gitFile: GitFileInputs = {
  busy: false,
  changed: true,
  untracked: false,
  unstaged: true,
  conflicted: false,
  hasEditor: true,
};

const idle: MenuInputs = {
  mode: "app",
  workspace: { folderCount: 1 },
  repo,
  gitFile: null,
  blameGutter: false,
  shownView: "file",
  activeFile: { dirty: false, editable: true, markdownMode: null },
  dirtyCount: 0,
  tabCount: 1,
  leftPanel: "changes",
  explorerOpen: false,
  leftBarVisible: true,
  rightBarVisible: true,
  terminalOpen: false,
  theme: "system",
  wordWrap: false,
  editor: { focused: false, inText: false, writable: false },
  hasRecent: true,
};

function inputs(changes: Partial<MenuInputs>): MenuInputs {
  return { ...idle, ...changes };
}

describe("menuState", () => {
  it("enables Save only for an edited file on screen", () => {
    expect(menuState(idle)["file.save"]?.enabled).toBe(false);
    expect(
      menuState(inputs({ activeFile: { dirty: true, editable: true, markdownMode: null }, dirtyCount: 1 }))["file.save"]
        ?.enabled,
    ).toBe(true);
    expect(menuState(inputs({ activeFile: null, dirtyCount: 1, shownView: "log" }))["file.save"]?.enabled).toBe(false);
    expect(menuState(inputs({ activeFile: null, dirtyCount: 1, shownView: "log" }))["file.saveAll"]?.enabled).toBe(
      true,
    );
  });

  it("enables Revert and Close Tab only when there is something to act on", () => {
    expect(menuState(idle)["file.revert"]?.enabled).toBe(true);
    expect(
      menuState(inputs({ activeFile: { dirty: false, editable: false, markdownMode: null } }))["file.revert"]?.enabled,
    ).toBe(false);
    expect(menuState(inputs({ shownView: "diff", activeFile: null }))["file.closeTab"]?.enabled).toBe(true);
    expect(menuState(inputs({ shownView: "log", activeFile: null }))["file.closeTab"]?.enabled).toBe(false);
  });

  it("offers New File with a folder open, and no file actions for an Untitled tab", () => {
    expect(menuState(idle)["file.newFile"]?.enabled).toBe(true);
    expect(menuState(inputs({ workspace: null }))["file.newFile"]?.enabled).toBe(false);
    const untitled = menuState(
      inputs({ activeFile: { dirty: true, editable: true, markdownMode: null, untitled: true } }),
    );
    expect(untitled["file.save"]?.enabled).toBe(true);
    expect(untitled["file.compareWith"]?.enabled).toBe(false);
    expect(untitled["file.compareWithClipboard"]?.enabled).toBe(false);
    expect(untitled["file.localHistory"]?.enabled).toBe(false);
  });

  it("offers Reopen Closed Tab after a tab closed, and names Pin Tab for the tab on screen", () => {
    expect(menuState(idle)["file.reopenClosedTab"]?.enabled).toBe(false);
    expect(menuState(inputs({ closedTabCount: 2 }))["file.reopenClosedTab"]?.enabled).toBe(true);
    expect(menuState(inputs({ closedTabCount: 2, workspace: null }))["file.reopenClosedTab"]?.enabled).toBe(false);
    expect(menuState(idle)["window.pinTab"]).toEqual({ enabled: true, text: "Pin Tab" });
    expect(menuState(inputs({ activeTabPinned: true }))["window.pinTab"]?.text).toBe("Unpin Tab");
    expect(menuState(inputs({ shownView: "log", activeFile: null }))["window.pinTab"]?.enabled).toBe(false);
  });

  it("needs a focused editor for the Code and Find items", () => {
    const away = menuState(idle);
    expect(away["code.lineComment"]?.enabled).toBe(false);
    expect(away["edit.find"]?.enabled).toBe(false);
    const typing = menuState(inputs({ editor: { focused: true, inText: true, writable: true } }));
    expect(typing["code.lineComment"]?.enabled).toBe(true);
    expect(typing["edit.findNext"]?.enabled).toBe(true);
    // A read-only editor can fold and go to a line, not edit.
    const reading = menuState(inputs({ editor: { focused: true, inText: true, writable: false } }));
    expect(reading["code.duplicate"]?.enabled).toBe(false);
    expect(reading["code.collapse"]?.enabled).toBe(true);
    // From the find bar's fields: Find works, the Code menu does not.
    const findBar = menuState(inputs({ editor: { focused: true, inText: false, writable: false } }));
    expect(findBar["edit.findPrevious"]?.enabled).toBe(true);
    expect(findBar["code.goToLine"]?.enabled).toBe(false);
  });

  it("offers the Markdown modes only for a Markdown file, ticking its mode", () => {
    expect(menuState(idle)["view.markdownSplit"]).toEqual({ enabled: false, checked: false });
    const markdown = menuState(inputs({ activeFile: { dirty: false, editable: true, markdownMode: "split" } }));
    expect(markdown["view.markdownSplit"]).toEqual({ enabled: true, checked: true });
    expect(markdown["view.markdownPreview"]).toEqual({ enabled: true, checked: false });
  });

  it("ticks the theme and the visible panels", () => {
    const state = menuState(
      inputs({ theme: "dark", explorerOpen: true, terminalOpen: true, leftPanel: "branches", shownView: "log" }),
    );
    expect(state["view.themeDark"]?.checked).toBe(true);
    expect(state["view.themeSystem"]?.checked).toBe(false);
    expect(state["view.filesPanel"]?.checked).toBe(true);
    expect(state["view.terminal"]?.checked).toBe(true);
    expect(state["view.branches"]?.checked).toBe(true);
    expect(state["view.changes"]?.checked).toBe(false);
    expect(state["view.sidebar"]?.checked).toBe(true);
    expect(state["view.log"]?.checked).toBe(true);
  });

  it("ticks Word Wrap from the setting, with or without a folder", () => {
    expect(menuState(inputs({ wordWrap: true }))["view.wordWrap"]).toEqual({ enabled: true, checked: true });
    expect(menuState(inputs({ wordWrap: false, workspace: null }))["view.wordWrap"]).toEqual({
      enabled: true,
      checked: false,
    });
  });

  it("ticks Sticky Scroll and Minimap from their settings", () => {
    expect(menuState(inputs({ stickyScroll: true, minimap: false }))["view.stickyScroll"]).toEqual({
      enabled: true,
      checked: true,
    });
    expect(menuState(inputs({ minimap: true }))["view.minimap"]).toEqual({ enabled: true, checked: true });
    expect(menuState(inputs({}))["view.minimap"]?.checked).toBe(false);
    expect(menuState(inputs({ fileIcons: "material" }))["view.fileIconsMaterial"]).toEqual({
      enabled: true,
      checked: true,
    });
    expect(menuState(inputs({ fileIcons: "material" }))["view.fileIconsMinimal"]?.checked).toBe(false);
    expect(menuState(inputs({}))["view.fileIconsOff"]?.checked).toBe(true);
    expect(menuState(inputs({ detectIndentation: true }))["view.detectIndentation"]).toEqual({
      enabled: true,
      checked: true,
    });
    expect(menuState(inputs({ detectIndentation: false }))["view.detectIndentation"]?.checked).toBe(false);
  });

  it("compares the file on screen with the clipboard or another file", () => {
    expect(menuState(inputs({}))["file.compareWith"]?.enabled).toBe(true);
    expect(menuState(inputs({}))["file.compareWithClipboard"]?.enabled).toBe(true);
    expect(menuState(inputs({ activeFile: null }))["file.compareWith"]?.enabled).toBe(false);
    expect(menuState(inputs({ workspace: null }))["file.compareWithClipboard"]?.enabled).toBe(false);
  });

  it("ticks Scripts while its panel shows", () => {
    expect(menuState(inputs({ leftPanel: "scripts" }))["view.scripts"]).toEqual({ enabled: true, checked: true });
    expect(menuState(idle)["view.scripts"]?.checked).toBe(false);
  });

  it("hides the Git Console items while its setting is off", () => {
    const on = menuState(inputs({ gitConsoleEnabled: true, gitConsoleOpen: true }));
    expect(on["view.gitConsole"]).toEqual({ enabled: true, checked: true, visible: true });
    expect(on["git.showConsole"]).toEqual({ enabled: true, visible: true });
    const off = menuState(inputs({ gitConsoleEnabled: false, gitConsoleOpen: true }));
    expect(off["view.gitConsole"]).toEqual({ enabled: false, checked: false, visible: false });
    expect(off["git.showConsole"]).toEqual({ enabled: false, visible: false });
  });

  it("disables workspace items without a workspace", () => {
    const state = menuState(inputs({ workspace: null, repo: null, shownView: "none", activeFile: null, tabCount: 0 }));
    expect(state["file.closeFolder"]?.enabled).toBe(false);
    expect(state["edit.goToFile"]?.enabled).toBe(false);
    expect(state["edit.recentFiles"]?.enabled).toBe(false);
    expect(state["edit.navigationBar"]?.enabled).toBe(false);
    expect(state["view.sidebar"]).toEqual({ enabled: false, checked: false });
    expect(state["git.fetch"]?.enabled).toBe(false);
    expect(state["window.nextTab"]?.enabled).toBe(false);
  });

  it("names Close Workspace for several folders", () => {
    expect(menuState(idle)["file.closeFolder"]?.text).toBe("Close Folder");
    expect(menuState(inputs({ workspace: { folderCount: 2 } }))["file.closeFolder"]?.text).toBe("Close Workspace");
  });

  it("waits with the Git items while an operation runs", () => {
    const state = menuState(inputs({ repo: { ...repo, busy: true } }));
    expect(state["git.push"]?.enabled).toBe(false);
    expect(state["git.showLog"]?.enabled).toBe(true);
  });

  it("offers Available MCP Tools in the main window, also without a workspace", () => {
    expect(menuState(idle)["help.mcpTools"]?.enabled).toBe(true);
    expect(
      menuState(inputs({ workspace: null, repo: null, activeFile: null, shownView: "none" }))["help.mcpTools"]?.enabled,
    ).toBe(true);
    expect(menuState(inputs({ mode: "mergeTool" }))["help.mcpTools"]).toBeUndefined();
    const help = menuSpec("macos", "app").find((menu) => menu.role === "help");
    expect(help?.items.some((entry) => entry.kind === "action" && entry.action === "help.mcpTools")).toBe(true);
  });

  it("only covers items of the menu it is for", () => {
    for (const mode of ["app", "mergeTool"] as const) {
      const actions = new Set(actionEntries(menuSpec("macos", mode)).map((entry) => entry.action));
      const stateful = Object.keys(menuState(inputs({ mode }))) as MenuAction[];
      expect(
        stateful.filter((action) => !actions.has(action)),
        mode,
      ).toEqual([]);
    }
  });
});

describe("changedState", () => {
  it("lists only what differs from the menu", () => {
    const shown = new Map<MenuAction, ItemState>([
      ["file.save", { enabled: false }],
      ["view.themeDark", { enabled: true, checked: false }],
      ["file.closeFolder", { enabled: true, text: "Close Folder" }],
    ]);
    expect(
      changedState(shown, {
        "file.save": { enabled: false },
        "view.themeDark": { enabled: true, checked: true },
        "file.closeFolder": { enabled: true, text: "Close Workspace" },
        "file.revert": { enabled: true },
      }),
    ).toEqual([
      ["view.themeDark", { checked: true }],
      ["file.closeFolder", { text: "Close Workspace" }],
      ["file.revert", { enabled: true }],
    ]);
  });
});

describe("Git menu", () => {
  it("shows how far the branch is ahead and behind, and offers force push", () => {
    const state = menuState(inputs({ repo: { ...repo, ahead: 1, behind: 2 } }));
    expect(state["git.pull"]?.text).toBe("Pull (2 behind)...");
    expect(state["git.push"]?.text).toBe("Push (1 ahead)...");
    expect(menuState(idle)["git.push"]?.text).toBe("Push...");
    expect(state["git.forcePush"]?.enabled).toBe(true);
    expect(countLabel("Push", 0, "ahead")).toBe("Push");
  });

  it("needs a branch and a remote to push and pull", () => {
    const detached = gitMenuState({ ...repo, branch: null }, null, false);
    expect(detached["git.push"]?.enabled).toBe(false);
    expect(detached["git.rebase"]?.enabled).toBe(false);
    expect(detached["git.merge"]?.enabled).toBe(true);
    const local = gitMenuState({ ...repo, remotes: 0 }, null, false);
    expect(local["git.pull"]?.enabled).toBe(false);
    expect(local["git.fetch"]?.enabled).toBe(false);
    const fresh = gitMenuState({ ...repo, unborn: true }, null, false);
    expect(fresh["git.newBranch"]?.enabled).toBe(false);
    expect(fresh["git.resetHead"]?.enabled).toBe(false);
    expect(fresh["git.commit"]?.enabled).toBe(true);
  });

  it("shows the operation items only during an operation, named after it", () => {
    const none = gitMenuState(repo, null, false);
    for (const action of ["git.resolveConflicts", "git.continueOp", "git.abortOp", "git.skipCommit"] as const) {
      expect(none[action]?.visible, action).toBe(false);
    }
    const rebasing = gitMenuState({ ...repo, op: "rebase", conflicts: 2 }, null, false);
    expect(rebasing["git.continueOp"]).toEqual({ enabled: false, visible: true, text: "Continue Rebase" });
    expect(rebasing["git.abortOp"]).toEqual({ enabled: true, visible: true, text: "Abort Rebase" });
    expect(rebasing["git.skipCommit"]).toEqual({ enabled: true, visible: true });
    expect(rebasing["git.resolveConflicts"]).toEqual({ enabled: true, visible: true });
    expect(rebasing["git.pull"]?.enabled).toBe(false);
    expect(rebasing["git.interactiveRebase"]?.enabled).toBe(false);
    const picking = gitMenuState({ ...repo, op: "cherryPick" }, null, false);
    expect(picking["git.continueOp"]).toEqual({ enabled: true, visible: true, text: "Continue Cherry-Pick" });
    expect(picking["git.skipCommit"]?.visible).toBe(false);
    expect(picking["git.resolveConflicts"]?.visible).toBe(false);
    expect(gitMenuState({ ...repo, op: "revert" }, null, false)["git.abortOp"]?.text).toBe("Abort Revert");
    expect(gitMenuState({ ...repo, op: "merge" }, null, false)["git.continueOp"]?.text).toBe("Continue Merge");
    // A stash that stopped with conflicts has no operation to continue.
    const stashConflicts = gitMenuState({ ...repo, conflicts: 1 }, null, false);
    expect(stashConflicts["git.resolveConflicts"]?.visible).toBe(true);
    expect(stashConflicts["git.continueOp"]?.visible).toBe(false);
  });

  it("acts on the current file only when it is in a repository", () => {
    const none = gitMenuState(repo, null, true);
    expect(none["git.file.history"]?.enabled).toBe(false);
    expect(none["git.file.annotate"]).toEqual({ enabled: false, checked: false });
    const changed = gitMenuState(repo, gitFile, true);
    expect(changed["git.file.commit"]?.enabled).toBe(true);
    expect(changed["git.file.rollback"]?.enabled).toBe(true);
    expect(changed["git.file.annotate"]).toEqual({ enabled: true, checked: true });
    const clean = gitMenuState(repo, { ...gitFile, changed: false, unstaged: false }, false);
    expect(clean["git.file.showDiff"]?.enabled).toBe(false);
    expect(clean["git.file.add"]?.enabled).toBe(false);
    expect(clean["git.file.compareBranch"]?.enabled).toBe(true);
    const untracked = gitMenuState(repo, { ...gitFile, untracked: true }, false);
    expect(untracked["git.file.add"]?.enabled).toBe(true);
    expect(untracked["git.file.history"]?.enabled).toBe(false);
    expect(untracked["git.file.rollback"]?.enabled).toBe(false);
    const conflicted = gitMenuState(repo, { ...gitFile, conflicted: true }, false);
    expect(conflicted["git.file.commit"]?.enabled).toBe(false);
    expect(gitMenuState(repo, { ...gitFile, hasEditor: false }, false)["git.file.historySelection"]?.enabled).toBe(
      false,
    );
  });

  it("shows GitHub for every repository, its links only with a github.com remote, and allows Clone without a repository", () => {
    const local = gitMenuState(repo, null, false);
    expect(local["git.github.share"]).toEqual({ enabled: true, visible: true });
    expect(local["git.github.open"]?.enabled).toBe(false);
    expect(local["git.github.syncFork"]?.enabled).toBe(false);
    expect(gitMenuState(null, null, false)["git.github.share"]?.visible).toBe(false);
    expect(gitMenuState({ ...repo, busy: true }, null, false)["git.github.share"]?.enabled).toBe(false);
    const github = gitMenuState({ ...repo, github: true }, gitFile, false);
    expect(github["git.github.open"]?.enabled).toBe(true);
    expect(github["git.github.share"]?.enabled).toBe(false);
    expect(github["git.github.syncFork"]?.enabled).toBe(true);
    expect(github["git.github.copyLink"]?.enabled).toBe(true);
    expect(gitMenuState({ ...repo, github: true }, null, false)["git.github.copyLink"]?.enabled).toBe(false);
    expect(gitMenuState(null, null, false)["git.clone"]?.enabled).toBe(true);
    expect(local["git.openRemote"]?.enabled).toBe(false);
    expect(gitMenuState({ ...repo, remoteLinks: 2, busy: true }, null, false)["git.openRemote"]?.enabled).toBe(true);
    expect(gitMenuState(null, null, false)["git.openRemote"]?.enabled).toBe(false);
    expect(gitMenuState(null, null, false)["git.commit"]?.enabled).toBe(false);
  });

  it("offers the line actions of the Changes diff on screen", () => {
    const unstaged = menuState(inputs({ shownView: "diff", diffLines: "unstaged" }));
    expect(unstaged["git.lines.stage"]?.enabled).toBe(true);
    expect(unstaged["git.lines.discard"]?.enabled).toBe(true);
    expect(unstaged["git.lines.unstage"]?.enabled).toBe(false);
    const staged = menuState(inputs({ shownView: "diff", diffLines: "staged" }));
    expect(staged["git.lines.unstage"]?.enabled).toBe(true);
    expect(staged["git.lines.stage"]?.enabled).toBe(false);
    // Another view on screen, no diff, or Git busy.
    expect(menuState(inputs({ shownView: "log", diffLines: "unstaged" }))["git.lines.stage"]?.enabled).toBe(false);
    expect(menuState(inputs({ shownView: "diff" }))["git.lines.stage"]?.enabled).toBe(false);
    expect(
      menuState(inputs({ shownView: "diff", diffLines: "unstaged", repo: { ...repo, busy: true } }))["git.lines.stage"]
        ?.enabled,
    ).toBe(false);
  });

  it("tells the menu when an item appears or goes", () => {
    const shown = new Map<MenuAction, ItemState>([["git.skipCommit", { enabled: true }]]);
    expect(changedState(shown, { "git.skipCommit": { enabled: true, visible: false } })).toEqual([
      ["git.skipCommit", { visible: false }],
    ]);
    expect(changedState(shown, { "git.skipCommit": { enabled: true, visible: true } })).toEqual([]);
  });
});

describe("activity bars", () => {
  it("ticks the edge bars that are visible", () => {
    const state = menuState(inputs({ leftBarVisible: true, rightBarVisible: false }));
    expect(state["view.leftActivityBar"]?.checked).toBe(true);
    expect(state["view.rightActivityBar"]?.checked).toBe(false);
  });
});

describe("while a git command runs", () => {
  it("greys out every Git action that would wait for it, and keeps the views", () => {
    const state = menuState(inputs({ repo: { ...repo, busy: true } }));
    for (const action of ["git.fetch", "git.fetchCurrent", "git.push", "git.commit", "git.bisect.good"] as const) {
      expect(state[action]?.enabled ?? false, action).toBe(false);
    }
    expect(state["git.showLog"]?.enabled).toBe(true);
  });
});
