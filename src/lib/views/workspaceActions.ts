// What the window-wide shortcuts do (workspaceShortcuts.ts decides which key means which),
// shared by Workspace.svelte's key handler and the View and Edit menus, so a key and its
// menu item always run the same code.

import { localHistory } from "$lib/localHistory/localHistory.svelte";
import { navBarStore } from "$lib/navBar/navBarStore.svelte";
import { quickOpen } from "$lib/quickOpen/quickOpenStore.svelte";
import { recentFilesStore } from "$lib/recentFiles/recentFilesStore.svelte";
import { fileSearch } from "$lib/search/fileSearchStore.svelte";
import { focusedEditor } from "$lib/editor/editorCommands";
import { openerForShortcut, queryFromSelection, type SearchOpener } from "$lib/search/searchTabs";
import { navigation } from "$lib/stores/navigation.svelte";
import type { SplitDirection } from "$lib/stores/groupLayout";
import { repoStore } from "$lib/stores/repo.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { isPseudoTab } from "$lib/stores/pseudoTabs";
import { adjacentTab } from "$lib/stores/tabs";
import { terminalStore } from "$lib/terminal/terminalStore.svelte";
import { dialogs } from "$lib/ui/dialog.svelte";
import { toast } from "$lib/ui/toast.svelte";
import { updates } from "$lib/update/updates.svelte";
import { changesSelection } from "./changes/selection.svelte";
import { gitDialogs } from "./git/gitDialogs.svelte";
import type { WorkspaceShortcut } from "./workspaceShortcuts";

/** The window shortcuts wait while a dialog, a popup (Search Everywhere, Quick Open, Recent Files, the Navigation Bar) or the merge tool is up. */
export function shortcutsBlocked(): boolean {
  return (
    dialogs.active !== null ||
    gitDialogs.active !== null ||
    fileSearch.isOpen ||
    quickOpen.isOpen ||
    recentFilesStore.isOpen ||
    navBarStore.isOpen ||
    localHistory.isOpen ||
    repoStore.mergeTarget !== null
  );
}

/** Search Everywhere, Quick Open, Recent Files and the Navigation Bar wait while any dialog, another popup or the merge tool is up. */
function overlayOpen(): boolean {
  return (
    quickOpen.isOpen ||
    recentFilesStore.isOpen ||
    navBarStore.isOpen ||
    dialogs.active !== null ||
    gitDialogs.active !== null ||
    repoStore.mergeTarget !== null ||
    repoStore.conflictsOpen ||
    settings.dialogOpen ||
    updates.dialogOpen ||
    updates.whatsNewOpen ||
    localHistory.isOpen
  );
}

/** The focused editor's selected text, read from its state so decorations never leak in. */
function editorSelection(): string {
  const view = focusedEditor()?.view ?? null;
  if (!view) {
    return "";
  }
  const { from, to } = view.state.selection.main;
  return queryFromSelection(view.state.sliceDoc(from, to));
}

/** Opens Search Everywhere; every tab starts with the editor's selection. */
export function openFileSearch(opener: SearchOpener, replace = false): void {
  if (!overlayOpen()) {
    fileSearch.open(opener, editorSelection(), replace);
  }
}

/**
 * Opens Quick Open (Cmd+P) with `prefix` typed: "" for files, ">" for the
 * Command Palette. It never opens over Search Everywhere: the two popups stay apart.
 */
export function openQuickOpen(prefix: string): void {
  if (!overlayOpen() && !fileSearch.isOpen) {
    quickOpen.open(prefix);
  }
}

/**
 * Opens Recent Files (Cmd+E); never over Search Everywhere or another popup.
 * Turned off in Settings, the key says so and offers the setting instead of doing nothing.
 */
export function openRecentFiles(): void {
  if (overlayOpen() || fileSearch.isOpen) {
    return;
  }
  if (!settings.recentFiles) {
    toast.show("info", "Recent Files is off", "Turn it on in Settings > Editor > Recent Files.", {
      timeoutMs: 8000,
      action: { label: "Open Settings", run: () => settings.openDialog("editor") },
    });
    return;
  }
  recentFilesStore.open();
}

/** Jump to Navigation Bar (Cmd+Up): the path bar of the file on screen, or a floating one. */
export function openNavigationBar(): void {
  if (!overlayOpen() && !fileSearch.isOpen) {
    navBarStore.jump();
  }
}

export function runWorkspaceShortcut(shortcut: WorkspaceShortcut): void {
  switch (shortcut) {
    case "navigationBar":
      openNavigationBar();
      break;
    case "quickOpen":
      openQuickOpen("");
      break;
    case "recentFiles":
      openRecentFiles();
      break;
    case "commandPalette":
      openQuickOpen(">");
      break;
    case "goBack":
      void navigation.goBack();
      break;
    case "goForward":
      void navigation.goForward();
      break;
    case "toggleExplorer":
      settings.toggleExplorer();
      break;
    case "toggleWordWrap":
      settings.toggleWordWrap();
      break;
    case "toggleSidebar":
      settings.toggleLeftSide();
      break;
    case "showChanges":
      settings.setLeftPanel("changes");
      break;
    case "showBranches":
      settings.setLeftPanel("branches");
      break;
    case "toggleLog":
      changesSelection.toggleLog();
      break;
    case "toggleTerminal":
      terminalStore.toggle();
      break;
    case "newTerminal":
      void terminalStore.create();
      break;
    case "goToFile":
    case "goToClass":
    case "goToSymbol":
    case "findInFiles":
      openFileSearch(openerForShortcut(shortcut) ?? "files");
      break;
    case "replaceInFiles":
      openFileSearch("text", true);
      break;
    case "nextTab":
    case "previousTab":
      switchTab(shortcut === "nextTab" ? 1 : -1);
      break;
  }
}

/** Next / Previous Tab go round the focused group's strip. */
function switchTab(step: 1 | -1): void {
  const activePath = changesSelection.shownView === "file" ? repoStore.openFilePath : null;
  const groupId = repoStore.focusedGroupId;
  const next = adjacentTab(repoStore.groupById(groupId)?.tabs ?? [], activePath, step);
  if (next) {
    repoStore.activateTab(groupId, next);
  }
}

/** A file's editor in `groupId` takes the keyboard once it is there (its editor may mount later). */
function focusEditorIn(tabPath: string, groupId: number): void {
  if (!isPseudoTab(tabPath)) {
    navigation.focusEditor(tabPath, groupId);
  }
}

/** Split Right / Split Down: the tab on screen also opens in a new group, which takes the keyboard. */
export function splitEditor(tabPath: string | null, direction: SplitDirection): void {
  if (!tabPath || !repoStore.canSplit(tabPath)) {
    return;
  }
  focusEditorIn(tabPath, repoStore.nextGroupId);
  repoStore.split(tabPath, direction);
}

/** Move Tab to Other Group, the keyboard going with it. */
export function moveEditorTab(tabPath: string, groupId: number = repoStore.focusedGroupId): void {
  if (!settings.splitEditor) {
    return;
  }
  focusEditorIn(tabPath, repoStore.moveTargetFor(groupId));
  repoStore.moveTabToOtherGroup(tabPath, groupId);
}
