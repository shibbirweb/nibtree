// Builds the native menu bar from menuSpec.ts with Tauri's menu API and keeps its enabled,
// checked and Open Recent state in step with the app. Built from the frontend because the
// items, their actions and the state they show all live here. Items with a state are
// created one by one (to keep a handle for updates), the rest with their top menu in one
// call; later only the items whose state changed are updated, after a short pause. A menu
// with items that come and go (the Git menu's operation items, GitHub) keeps a handle for
// each of its entries, so they can be removed and inserted again in place. Custom keyboard
// shortcuts change the accelerators of the items concerned, once per change in Settings.
//
// Every window builds its own menu bar, and a click runs in the window whose page built the
// item, with that window's enabled and checked state. macOS has one menu bar for the whole
// app, so the window that comes to the front puts its own menu bar back; on Windows and Linux
// each window has its own.

import {
  CheckMenuItem,
  Menu,
  MenuItem,
  type MenuItemOptions,
  PredefinedMenuItem,
  type PredefinedMenuItemOptions,
  Submenu,
  type SubmenuOptions,
} from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { untrack } from "svelte";
import { errorMessage } from "$lib/api";
import { isBrowserHost } from "$lib/browser/host";
import { menuAccelerators } from "$lib/commands/registry";
import { usableOverrides } from "$lib/commands/shortcutSettings";
import { diffLines } from "$lib/diff/diffLines.svelte";
import { fileCommands } from "$lib/stores/fileCommands.svelte";
import { repoStore } from "$lib/stores/repo.svelte";
import { isUntitledTab } from "$lib/stores/untitledTabs";
import { settings } from "$lib/stores/settings.svelte";
import { SIDE_PANELS } from "$lib/stores/sidePanels";
import { terminalStore } from "$lib/terminal/terminalStore.svelte";
import { dialogs } from "$lib/ui/dialog.svelte";
import { toast } from "$lib/ui/toast.svelte";
import { changesSelection } from "$lib/views/changes/selection.svelte";
import { gitFileInputs, gitRepoInputs } from "$lib/views/git/gitMenuInputs";
import { recentEntries, recentMenuText } from "$lib/views/recentEntries";
import { openRecent } from "$lib/views/repoPicker";
import { editorFocus } from "./editorFocus.svelte";
import { runMenuAction } from "./menuActions";
import type { MenuAction, MenuMode, MenuPlatform } from "./menuIds";
import { changedState, isShown, type ItemState, type MenuInputs, menuState, type MenuState } from "./menuState";
import { actionEntries, type MenuEntry, menuSpec, platformFromUserAgent, type TopMenu } from "./menuSpec";

/** Waits this long after the last change before updating the menu. */
const SYNC_DELAY_MS = 60;

/**
 * Tauri routes a click to the handler registered for the item's id, and freeing any item
 * removes the handler of its id. A reload of the page builds a new menu bar while the old
 * one is still being freed, so reused ids would lose their new handlers and the items
 * would do nothing. Each page load therefore uses ids of its own.
 */
const BUILD_ID = Math.random().toString(36).slice(2, 10);

function itemId(action: MenuAction): string {
  return `${action}#${BUILD_ID}`;
}

type ItemOptions = MenuItemOptions | PredefinedMenuItemOptions | SubmenuOptions | MenuItem | CheckMenuItem | Submenu;
type ItemHandle = MenuItem | CheckMenuItem | PredefinedMenuItem | Submenu;

/** An entry of a menu whose items come and go. */
interface TrackedEntry {
  handle: ItemHandle;
  /** Shown while any of these items is visible; null: always shown. */
  dependsOn: MenuAction[] | null;
  present: boolean;
}

interface TrackedMenu {
  menu: Submenu | null;
  entries: TrackedEntry[];
}

function entryDependencies(entry: MenuEntry): MenuAction[] | null {
  if (entry.kind === "action") {
    return [entry.action];
  }
  if (entry.kind === "separator" || entry.kind === "submenu") {
    return entry.visibleWith ?? null;
  }
  return null;
}

/** A list needs tracking when an entry in it can be hidden. */
function needsTracking(entries: MenuEntry[], state: MenuState): boolean {
  return entries.some(
    (entry) =>
      (entry.kind === "action" && state[entry.action]?.visible !== undefined) ||
      ((entry.kind === "separator" || entry.kind === "submenu") && entry.visibleWith !== undefined),
  );
}

/** What the menu state is computed from, read from the stores (reactive reads only). */
export function currentMenuInputs(mode: MenuMode): MenuInputs {
  const shownView = changesSelection.shownView;
  const activePath = shownView === "file" ? repoStore.openFilePath : null;
  const fileState = activePath ? (fileCommands.states[activePath] ?? null) : null;
  const workspace = repoStore.workspace;
  return {
    mode,
    workspace: workspace ? { folderCount: workspace.folders.length } : null,
    repo: gitRepoInputs(),
    gitFile: gitFileInputs(activePath),
    blameGutter: settings.blameGutter,
    shownView,
    activeFile:
      fileState && activePath
        ? {
            dirty: repoStore.isDirty(activePath),
            editable: fileState.editable,
            markdownMode: fileState.markdownMode,
            untitled: isUntitledTab(activePath),
          }
        : null,
    dirtyCount: repoStore.dirtyPaths.length,
    tabCount: repoStore.tabs.length,
    closedTabCount: repoStore.closedTabs.length,
    activeTabPinned: repoStore.isPinned(activePath),
    logShown: changesSelection.logShown,
    editorGroups: {
      enabled: settings.splitEditor,
      count: repoStore.groups.length,
      focusedIndex: Math.max(
        0,
        repoStore.groups.findIndex((group) => group.id === repoStore.focusedGroupId),
      ),
      canSplit: repoStore.canSplit(activePath),
    },
    leftPanel: settings.leftPanel,
    shownPanels: SIDE_PANELS.filter((panel) => settings.panelShown(panel)),
    explorerOpen: settings.filesPanelShown,
    aiPanelOpen: settings.aiPanelShown,
    leftBarVisible: settings.leftBarVisible,
    rightBarVisible: settings.rightBarVisible,
    terminalOpen: terminalStore.panelOpen && terminalStore.panelTab === "terminal",
    gitConsoleOpen: terminalStore.panelOpen && terminalStore.panelTab === "gitConsole",
    gitConsoleEnabled: settings.gitConsole,
    theme: settings.theme,
    wordWrap: settings.wordWrap,
    stickyScroll: settings.editorStickyScroll,
    minimap: settings.editorMinimap,
    fileIcons: settings.fileIcons,
    detectIndentation: settings.detectIndentation,
    doNotDisturb: settings.notificationsDoNotDisturb,
    notificationsOpen: settings.notificationsPanelShown,
    diffLines: diffLines.target?.mode ?? null,
    editor: { focused: editorFocus.focused, inText: editorFocus.inText, writable: editorFocus.writable },
    hasRecent:
      settings.recentRepos.length + settings.recentWorkspaces.length + settings.recentWorkspaceFiles.length > 0,
  };
}

class AppMenu {
  private platform: MenuPlatform = "macos";
  private mode: MenuMode = "app";
  /** Items whose state changes, created up front so they can be updated. */
  private items = new Map<MenuAction, MenuItem | CheckMenuItem>();
  /** What the native menu shows now. */
  private shown = new Map<MenuAction, ItemState>();
  private recentMenu: Submenu | null = null;
  private recentQueue: Promise<void> = Promise.resolve();
  private recentKey: string | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private installed = false;
  private tracked: TrackedMenu[] = [];
  /** Items without a state, kept so their click handlers stay registered. */
  private kept: MenuItem[] = [];
  /** The Open Recent entries shown now, closed when the list changes. */
  private recentItems: MenuItem[] = [];
  private visibilityQueue: Promise<void> = Promise.resolve();
  private spec: TopMenu[] = [];
  /** Every action item's objects, for accelerator changes. */
  private actionItems = new Map<MenuAction, Set<MenuItem | CheckMenuItem>>();
  /** This window's menu bar, with its Window and Help menus (macOS lists the windows in the first). */
  private menuBar: { menu: Menu; windowMenu: Submenu | null; helpMenu: Submenu | null } | null = null;
  /** The accelerator each item shows now. */
  private accelerators = new Map<MenuAction, string | null>();

  /** Replaces the default menu bar; once per window. */
  async install(mode: MenuMode): Promise<void> {
    if (this.installed) {
      return;
    }
    this.installed = true;
    this.mode = mode;
    this.platform = platformFromUserAgent(navigator.userAgent);
    // A browser tab has no native menu bar; the page's own menu bar is still to come.
    if (isBrowserHost()) {
      return;
    }
    try {
      const spec = menuSpec(this.platform, mode);
      this.spec = spec;
      // Built with the menu's own keys; custom ones follow (follow), so a key the native
      // menu refuses only leaves that item without one instead of failing the menu bar.
      this.accelerators = menuAccelerators(spec);
      const initial = menuState(this.inputs());
      await this.createStatefulItems(spec, initial);
      const menus = await Promise.all(spec.map((top) => this.createTopMenu(top, initial)));
      const menu = await Menu.new({ items: menus });
      this.menuBar = {
        menu,
        windowMenu: this.forRole(spec, menus, "window"),
        helpMenu: this.forRole(spec, menus, "help"),
      };
      if (this.platform === "macos") {
        const current = getCurrentWindow();
        void current
          .onFocusChanged(({ payload: focused }) => {
            if (focused) {
              void this.claimMenuBar().catch(() => undefined);
            }
          })
          .catch(() => undefined);
        // Windows restored at start build their menus at the same time: only the one in front takes the bar.
        if (await current.isFocused().catch(() => true)) {
          await this.claimMenuBar();
        }
      } else {
        await menu.setAsWindowMenu();
      }
      editorFocus.start();
      this.follow();
    } catch (error) {
      toast.error("Could not build the menu bar", errorMessage(error));
    }
  }

  /** macOS: this window's menu bar becomes the app's, with the window list and Help search. */
  private async claimMenuBar(): Promise<void> {
    const bar = this.menuBar;
    if (!bar) {
      return;
    }
    await bar.menu.setAsAppMenu();
    await bar.windowMenu?.setAsWindowsMenuForNSApp();
    await bar.helpMenu?.setAsHelpMenuForNSApp();
  }

  private forRole(spec: TopMenu[], menus: Submenu[], role: TopMenu["role"]): Submenu | null {
    const index = spec.findIndex((top) => top.role === role);
    return index >= 0 ? menus[index] : null;
  }

  /** Items with an enabled, checked or text state get their own object, created with that state. */
  private async createStatefulItems(spec: TopMenu[], initial: MenuState): Promise<void> {
    const entries = actionEntries(spec).filter((entry) => initial[entry.action] !== undefined);
    await Promise.all(
      entries.map(async (entry) => {
        const state = initial[entry.action] ?? { enabled: true };
        const options = {
          id: itemId(entry.action),
          text: state.text ?? entry.text,
          enabled: state.enabled,
          accelerator: entry.accelerator ?? undefined,
          action: () => this.onAction(entry.action, entry.check),
        };
        const created = entry.check
          ? await CheckMenuItem.new({ ...options, checked: state.checked ?? false })
          : await MenuItem.new(options);
        this.items.set(entry.action, created);
        this.rememberItem(entry.action, created);
        this.shown.set(entry.action, { ...state, text: state.text ?? entry.text });
      }),
    );
  }

  private async createTopMenu(top: TopMenu, initial: MenuState): Promise<Submenu> {
    return this.createSubmenu(top.text, top.items, initial);
  }

  /** A submenu; one with items that come and go gets a handle per entry and starts with the shown ones. */
  private async createSubmenu(text: string, entries: MenuEntry[], initial: MenuState): Promise<Submenu> {
    if (!needsTracking(entries, initial)) {
      const items: ItemOptions[] = [];
      for (const entry of entries) {
        items.push(await this.itemOptions(entry, initial));
      }
      return Submenu.new({ text, items });
    }
    const tracked: TrackedMenu = { menu: null, entries: [] };
    for (const entry of entries) {
      const dependsOn = entryDependencies(entry);
      tracked.entries.push({
        handle: await this.itemHandle(entry, initial),
        // An action without a visible state is always there.
        dependsOn: entry.kind === "action" && initial[entry.action]?.visible === undefined ? null : dependsOn,
        present: false,
      });
    }
    for (const entry of tracked.entries) {
      entry.present = isShown(entry.dependsOn, initial);
    }
    tracked.menu = await Submenu.new({
      text,
      items: tracked.entries.filter((entry) => entry.present).map((entry) => entry.handle),
    });
    this.tracked.push(tracked);
    return tracked.menu;
  }

  /** An entry as an object, for menus that insert and remove entries later. */
  private async itemHandle(entry: MenuEntry, initial: MenuState): Promise<ItemHandle> {
    switch (entry.kind) {
      case "separator":
        return PredefinedMenuItem.new({ item: "Separator" });
      case "native":
        return PredefinedMenuItem.new(entry.text ? { item: entry.item, text: entry.text } : { item: entry.item });
      case "submenu":
        return this.createSubmenu(entry.text, entry.items, initial);
      case "recent":
        return this.createRecentMenu(entry.text, entry.clear.action);
      case "action": {
        const created = this.items.get(entry.action);
        if (created) {
          return created;
        }
        const action = entry.action;
        const item = await MenuItem.new({
          id: itemId(action),
          text: entry.text,
          accelerator: entry.accelerator ?? undefined,
          action: () => this.onAction(action, false),
        });
        this.rememberItem(action, item);
        return item;
      }
    }
  }

  private async itemOptions(entry: MenuEntry, initial: MenuState): Promise<ItemOptions> {
    switch (entry.kind) {
      case "separator":
        return { item: "Separator" };
      case "native":
        return entry.text ? { item: entry.item, text: entry.text } : { item: entry.item };
      case "submenu":
        return this.createSubmenu(entry.text, entry.items, initial);
      case "recent":
        return this.createRecentMenu(entry.text, entry.clear.action);
      case "action": {
        const created = this.items.get(entry.action);
        if (created) {
          return created;
        }
        const action = entry.action;
        // An object of its own, kept: Tauri frees the handle of an item given as options
        // inside Submenu.new right away, and that removes its click handler.
        const item = await MenuItem.new({
          id: itemId(action),
          text: entry.text,
          accelerator: entry.accelerator ?? undefined,
          action: () => this.onAction(action, false),
        });
        this.kept.push(item);
        this.rememberItem(action, item);
        return item;
      }
    }
  }

  /** Removes the entries that should go and inserts the ones that should come back, in menu order. */
  private async applyVisibility(state: MenuState): Promise<void> {
    for (const tracked of this.tracked) {
      const menu = tracked.menu;
      if (!menu) {
        continue;
      }
      let position = 0;
      for (const entry of tracked.entries) {
        const wanted = isShown(entry.dependsOn, state);
        if (wanted && !entry.present) {
          await menu.insert(entry.handle, position);
          entry.present = true;
        } else if (!wanted && entry.present) {
          await menu.remove(entry.handle);
          entry.present = false;
        }
        if (entry.present) {
          position++;
        }
      }
    }
  }

  private async createRecentMenu(text: string, clearAction: MenuAction): Promise<Submenu> {
    const clear = this.items.get(clearAction);
    this.recentMenu = await Submenu.new({ text, items: clear ? [{ item: "Separator" }, clear] : [] });
    return this.recentMenu;
  }

  private onAction(action: MenuAction, checkable: boolean): void {
    if (checkable) {
      // The system ticks a check item when clicked; show the app's state again afterwards.
      this.shown.delete(action);
    }
    runMenuAction(action);
    if (checkable) {
      setTimeout(() => this.sync(untrack(() => menuState(this.inputs()))), 0);
    }
  }

  private rememberItem(action: MenuAction, item: MenuItem | CheckMenuItem): void {
    const items = this.actionItems.get(action) ?? new Set();
    items.add(item);
    this.actionItems.set(action, items);
  }

  /** Gives the items whose key changed their new accelerator. */
  private applyAccelerators(wanted: Map<MenuAction, string | null>): void {
    for (const [action, accelerator] of wanted) {
      if (this.accelerators.get(action) === accelerator) {
        continue;
      }
      this.accelerators.set(action, accelerator);
      for (const item of this.actionItems.get(action) ?? []) {
        // A key the native menu refuses leaves the item without one; the window still runs it.
        void item.setAccelerator(accelerator).catch(() => undefined);
      }
    }
  }

  /** Follows the app state; only reactive reads happen in `inputs`. */
  private follow(): void {
    $effect.root(() => {
      $effect(() => {
        const wanted = menuAccelerators(this.spec, usableOverrides(settings.keybindings, this.platform));
        untrack(() => this.applyAccelerators(wanted));
      });
      $effect(() => {
        const next = menuState(this.inputs());
        untrack(() => this.schedule(next));
      });
      $effect(() => {
        const entries = recentEntries(settings, {
          file: repoStore.workspace?.file ?? null,
          folderRoots: repoStore.workspace?.folders.map((folder) => folder.root) ?? [],
        });
        const key = entries.map(recentMenuText).join("\n");
        untrack(() => {
          // A rescan replaces the workspace object without changing the list: nothing to redo.
          if (key === this.recentKey) {
            return;
          }
          this.recentKey = key;
          this.recentQueue = this.recentQueue.then(() => this.fillRecent(entries)).catch(() => undefined);
        });
      });
    });
  }

  private inputs(): MenuInputs {
    return currentMenuInputs(this.mode);
  }

  /** The window the menu was built for; "app" until it is installed. */
  get menuMode(): MenuMode {
    return this.mode;
  }

  get menuPlatform(): MenuPlatform {
    return this.platform;
  }

  private schedule(next: MenuState): void {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(next), SYNC_DELAY_MS);
  }

  private sync(next: MenuState): void {
    let visibilityChanged = false;
    for (const [action, diff] of changedState(this.shown, next)) {
      if (diff.visible !== undefined) {
        visibilityChanged = true;
      }
      const item = this.items.get(action);
      const wanted = next[action];
      if (!item || !wanted) {
        continue;
      }
      // Recorded first, so a newer update is compared with what is on its way.
      this.shown.set(action, { ...this.shown.get(action), ...wanted });
      const calls: Promise<void>[] = [];
      if (diff.enabled !== undefined) {
        calls.push(item.setEnabled(diff.enabled));
      }
      if (diff.checked !== undefined && item instanceof CheckMenuItem) {
        calls.push(item.setChecked(diff.checked));
      }
      if (diff.text !== undefined) {
        calls.push(item.setText(diff.text));
      }
      // A failed update only leaves one item stale; the next change retries it.
      void Promise.all(calls).catch(() => this.shown.delete(action));
    }
    if (visibilityChanged) {
      // One change at a time, so positions are counted on the menu as it is.
      this.visibilityQueue = this.visibilityQueue.then(() => this.applyVisibility(next)).catch(() => undefined);
    }
  }

  /** Open Recent: the recent entries, then a separator and Clear Recent (kept in place). */
  private async fillRecent(entries: ReturnType<typeof recentEntries>): Promise<void> {
    const menu = this.recentMenu;
    if (!menu) {
      return;
    }
    // Everything above the separator and Clear Recent goes; each listed item is a new handle to close.
    const current = await menu.items();
    for (const [index, old] of current.entries()) {
      if (index < current.length - 2) {
        await menu.remove(old);
      }
      await old.close();
    }
    for (const old of this.recentItems) {
      await old.close();
    }
    // Objects of their own, kept until the list changes, so their clicks arrive (see itemOptions).
    this.recentItems = await Promise.all(
      entries.map((entry) =>
        MenuItem.new({
          text: this.menuText(recentMenuText(entry)),
          action: () => {
            // Like every File item, it waits while an in-app dialog asks something.
            if (dialogs.active === null) {
              void openRecent(entry);
            }
          },
        }),
      ),
    );
    if (this.recentItems.length > 0) {
      await menu.insert(this.recentItems, 0);
    }
  }

  /** Windows and Linux read "&" as a mnemonic marker. */
  private menuText(text: string): string {
    return this.platform === "macos" ? text : text.replaceAll("&", "&&");
  }
}

export const appMenu = new AppMenu();
