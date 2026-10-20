// Editor tabs with a preview tab: a single click
// opens (or replaces) the one preview tab; double-clicking or editing pins it.
// Pinned tabs (Pin Tab) always sit together at the start of the strip.

import { compareTabsInFolder, compareTabTitle, parseCompareTabPath } from "$lib/compare/compareTabs";
import { isTerminalTab } from "$lib/terminal/terminalTabs";
import { commitTabsInFolder, parseCommitTabPath } from "./commitTabs";
import { branchTabsInFolder, branchTabTitle, parseBranchTabPath } from "./branchTabs";
import { gitTabsInFolder, gitTabTitle, parseGitTabPath } from "./gitTabs";
import { isPseudoTab } from "./pseudoTabs";
import { SINGLE_TAB } from "./tabLimit";
import { isUntitledTab, UNTITLED_TITLE } from "./untitledTabs";
import { movedPath, pathsUnder, type PathMove } from "./workspacePaths";
import { distinctFolderHints } from "./tabHints";

export interface FileTab {
  /** Absolute path (see workspacePaths.ts). */
  path: string;
  /** Preview tabs are shown in italics and replaced by the next single-click open. */
  preview: boolean;
  dirty: boolean;
  /**
   * Pinned (Pin Tab): kept at the start of the strip, never closed by the tab limit or by
   * Close Others, Close to the Right and Close All. Not the same as keeping a preview tab open.
   */
  pinned?: boolean;
}

export interface TabsState {
  tabs: FileTab[];
  active: string | null;
}

/** Opens `path`: activates an existing tab, reuses the preview tab, or appends a new one. */
export function openTab(state: TabsState, path: string, pin: boolean): TabsState {
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing) {
    const tabs =
      pin && existing.preview
        ? state.tabs.map((tab) => (tab.path === path ? { ...tab, preview: false } : tab))
        : state.tabs;
    return { tabs, active: path };
  }
  const opened: FileTab = { path, preview: !pin, dirty: false };
  const previewIndex = state.tabs.findIndex((tab) => tab.preview && !tab.dirty);
  if (previewIndex >= 0) {
    const tabs = state.tabs.slice();
    tabs[previewIndex] = opened;
    return { tabs, active: path };
  }
  // A new tab goes right after the active one, as editors do, but never among the pinned tabs.
  const activeIndex = state.tabs.findIndex((tab) => tab.path === state.active);
  const tabs = state.tabs.slice();
  tabs.splice(Math.max(activeIndex >= 0 ? activeIndex + 1 : tabs.length, pinnedCount(tabs)), 0, opened);
  return { tabs, active: path };
}

export function pinnedCount(tabs: readonly FileTab[]): number {
  return tabs.filter((tab) => tab.pinned === true).length;
}

/** Pinned tabs first, each side keeping its order; returns `tabs` itself when already so. */
export function pinnedFirst<T extends FileTab>(tabs: T[]): T[] {
  const count = pinnedCount(tabs);
  if (tabs.slice(0, count).every((tab) => tab.pinned === true)) {
    return tabs;
  }
  return [...tabs.filter((tab) => tab.pinned === true), ...tabs.filter((tab) => tab.pinned !== true)];
}

/**
 * Drag and drop in the strip: moves `path` to the gap `gap` (0 is before the first tab,
 * `tabs.length` after the last), as gaps were before the move. A drag never pins or unpins:
 * a pinned tab stays among the pinned tabs and any other tab stays after them.
 */
export function moveTab(state: TabsState, path: string, gap: number): TabsState {
  const index = state.tabs.findIndex((tab) => tab.path === path);
  if (index < 0) {
    return state;
  }
  const boundary = pinnedCount(state.tabs);
  const pinned = state.tabs[index].pinned === true;
  const clamped = pinned ? Math.max(0, Math.min(gap, boundary)) : Math.max(boundary, Math.min(gap, state.tabs.length));
  const target = clamped > index ? clamped - 1 : clamped;
  if (target === index) {
    return state;
  }
  const tabs = state.tabs.slice();
  tabs.splice(target, 0, ...tabs.splice(index, 1));
  return { ...state, tabs };
}

export function pinTab(state: TabsState, path: string): TabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.path === path && tab.preview ? { ...tab, preview: false } : tab)),
  };
}

/** Pin Tab / Unpin Tab; pinning a preview tab also keeps it open. */
export function setTabPinned(state: TabsState, path: string, pinned: boolean): TabsState {
  const tab = state.tabs.find((candidate) => candidate.path === path);
  if (!tab || (tab.pinned ?? false) === pinned) {
    return state;
  }
  // Pinning moves the tab to the end of the pinned tabs, unpinning to the start of the others.
  const tabs = state.tabs.filter((candidate) => candidate.path !== path);
  tabs.splice(pinnedCount(tabs), 0, { ...tab, pinned, preview: pinned ? false : tab.preview });
  return { ...state, tabs };
}

/** Editing a file pins its tab so the next single-click does not replace it. */
export function setTabDirty(state: TabsState, path: string, dirty: boolean): TabsState {
  const tab = state.tabs.find((candidate) => candidate.path === path);
  if (!tab || (tab.dirty === dirty && (!dirty || !tab.preview))) {
    return state;
  }
  return {
    ...state,
    tabs: state.tabs.map((candidate) =>
      candidate.path === path ? { ...candidate, dirty, preview: dirty ? false : candidate.preview } : candidate,
    ),
  };
}

/** Closes the given tabs; the active tab moves to its right neighbour, else the left one. */
export function closeTabs(state: TabsState, paths: string[]): TabsState {
  const closing = new Set(paths);
  const tabs = state.tabs.filter((tab) => !closing.has(tab.path));
  if (!state.active || !closing.has(state.active)) {
    return { tabs, active: state.active };
  }
  const oldIndex = state.tabs.findIndex((tab) => tab.path === state.active);
  const right = state.tabs.slice(oldIndex + 1).find((tab) => !closing.has(tab.path));
  const left = state.tabs
    .slice(0, oldIndex)
    .reverse()
    .find((tab) => !closing.has(tab.path));
  return { tabs, active: right?.path ?? left?.path ?? null };
}

/** Close to the Right: the unpinned tabs after `path`. */
export function pathsToRight(state: TabsState, path: string): string[] {
  const index = state.tabs.findIndex((tab) => tab.path === path);
  return index < 0 ? [] : unpinnedPaths(state.tabs.slice(index + 1));
}

/** Close Others: every unpinned tab but `path`. */
export function otherPaths(state: TabsState, path: string): string[] {
  return unpinnedPaths(state.tabs.filter((tab) => tab.path !== path));
}

/** Close All keeps pinned tabs, as Close Others and Close to the Right do. */
export function unpinnedPaths(tabs: readonly FileTab[]): string[] {
  return tabs.filter((tab) => tab.pinned !== true).map((tab) => tab.path);
}

/**
 * Single tab title: in single tab mode (Tab limit set to Single tab), a strip holding exactly
 * one tab (the Diff tab counts) shows it as a centered name instead of a tab, while the
 * setting is on.
 */
export function showsTabAsTitle(enabled: boolean, tabLimit: number, tabCount: number, diffOpen: boolean): boolean {
  return enabled && tabLimit === SINGLE_TAB && tabCount + (diffOpen ? 1 : 0) === 1;
}

/**
 * Next Tab (step 1) / Previous Tab (step -1), wrapping around. With no tab on screen
 * (`activePath` null) it starts from the first or the last tab.
 */
export function adjacentTab(tabs: FileTab[], activePath: string | null, step: 1 | -1): string | null {
  if (tabs.length === 0) {
    return null;
  }
  const index = activePath === null ? -1 : tabs.findIndex((tab) => tab.path === activePath);
  if (index < 0) {
    return tabs[step === 1 ? 0 : tabs.length - 1].path;
  }
  return tabs[(index + step + tabs.length) % tabs.length].path;
}

/** Name of a terminal tab whose terminal is not known (any more); the tab strip shows the terminal's own name. */
export const TERMINAL_TAB_LABEL = "Terminal";

/**
 * Tab labels: the file name, plus as much of its folder as tells it apart when another tab has the same
 * name (tabHints.ts). A commit tab (see commitTabs.ts) is labelled with its short hash; a
 * terminal tab gets a placeholder, since only the terminal store knows its name.
 */
export function tabLabels(tabs: FileTab[]): Map<string, { name: string; hint: string | null }> {
  const byName = new Map<string, string[]>();
  const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  for (const tab of tabs) {
    if (!isPseudoTab(tab.path)) {
      byName.set(nameOf(tab.path), [...(byName.get(nameOf(tab.path)) ?? []), tab.path]);
    }
  }
  const hints = new Map<string, string | null>();
  for (const paths of byName.values()) {
    if (paths.length > 1) {
      distinctFolderHints(paths).forEach((hint, index) => hints.set(paths[index], hint));
    }
  }
  return new Map(
    tabs.map((tab) => {
      const commit = parseCommitTabPath(tab.path);
      if (commit) {
        return [tab.path, { name: commit.commitId.slice(0, 8), hint: null }];
      }
      const gitTab = parseGitTabPath(tab.path);
      if (gitTab) {
        return [tab.path, { name: gitTabTitle(gitTab).name, hint: null }];
      }
      const branchTab = parseBranchTabPath(tab.path);
      if (branchTab) {
        return [tab.path, { name: branchTabTitle(branchTab).name, hint: null }];
      }
      const compareTab = parseCompareTabPath(tab.path);
      if (compareTab) {
        return [tab.path, { name: compareTabTitle(compareTab).name, hint: null }];
      }
      if (isTerminalTab(tab.path)) {
        return [tab.path, { name: TERMINAL_TAB_LABEL, hint: null }];
      }
      if (isUntitledTab(tab.path)) {
        return [tab.path, { name: UNTITLED_TITLE, hint: null }];
      }
      return [tab.path, { name: nameOf(tab.path), hint: hints.get(tab.path) ?? null }];
    }),
  );
}

/**
 * An Untitled tab saved as a file: the tab shows the file from now on, at the same place.
 * When the file already has a tab, that one stays and the Untitled tab closes.
 */
export function replaceTabPath(state: TabsState, fromPath: string, toPath: string): TabsState {
  if (!state.tabs.some((tab) => tab.path === fromPath)) {
    return state;
  }
  if (state.tabs.some((tab) => tab.path === toPath)) {
    const closed = closeTabs(state, [fromPath]);
    return state.active === fromPath ? { ...closed, active: toPath } : closed;
  }
  return {
    tabs: state.tabs.map((tab) =>
      tab.path === fromPath ? { ...tab, path: toPath, preview: false, dirty: false } : tab,
    ),
    active: state.active === fromPath ? toPath : state.active,
  };
}

/**
 * Tabs that close with a workspace folder: its files and the commit and Git
 * tabs of its repositories. Terminal tabs stay, like terminals in the panel.
 */
export function tabsInFolder(tabPaths: string[], folderRoot: string): string[] {
  const prefix = folderRoot.endsWith("/") ? folderRoot : `${folderRoot}/`;
  const commits = new Set([
    ...commitTabsInFolder(tabPaths, folderRoot),
    ...gitTabsInFolder(tabPaths, folderRoot),
    ...branchTabsInFolder(tabPaths, folderRoot),
    ...compareTabsInFolder(tabPaths, folderRoot),
  ]);
  return tabPaths.filter((tabPath) => commits.has(tabPath) || (!isPseudoTab(tabPath) && tabPath.startsWith(prefix)));
}

/** File tabs (never pseudo tabs) of `entryPaths` or of files inside those folders. */
export function fileTabsUnder(tabPaths: string[], entryPaths: string[]): string[] {
  return pathsUnder(
    tabPaths.filter((tabPath) => !isPseudoTab(tabPath)),
    entryPaths,
  );
}

/**
 * Files were renamed or moved: their tabs, and the tabs of files inside a moved folder,
 * point at the new paths in place, keeping order, preview and dirty state. Returns `state`
 * itself when no tab moved.
 */
export function retargetTabs(state: TabsState, moves: PathMove[]): TabsState {
  const target = (tabPath: string) => (isPseudoTab(tabPath) ? tabPath : movedPath(tabPath, moves));
  if (!state.tabs.some((tab) => target(tab.path) !== tab.path)) {
    return state;
  }
  const seen = new Set<string>();
  const tabs: FileTab[] = [];
  for (const tab of state.tabs) {
    const path = target(tab.path);
    // A tab already open on the new path wins; the moved one folds into it.
    if (!seen.has(path)) {
      seen.add(path);
      tabs.push(path === tab.path ? tab : { ...tab, path });
    }
  }
  return { tabs, active: state.active === null ? null : target(state.active) };
}
