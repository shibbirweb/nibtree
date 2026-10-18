<script lang="ts">
  import ZoomBadge from "@nibtree/ui/components/ZoomBadge.svelte";
  import AppOverlays from "./AppOverlays.svelte";
  import { onMount, untrack } from "svelte";
  import { api, currentWindowLabel, errorMessage } from "$lib/api";
  import { askpass } from "$lib/askpass/askpass.svelte";
  import { viewLabel, watchScrolling } from "$lib/debug/memoryEvents";
  import { memoryLog } from "$lib/debug/memoryLog.svelte";
  import { WheelZoom } from "$lib/editor/wheelZoom";
  import { followEditorSettings } from "$lib/editorSettingsSync.svelte";
  import { isBrowserHost } from "$lib/browser/host";
  import { usesDefaultKeys } from "$lib/commands/commandRuntime";
  import { appMenu } from "$lib/menu/appMenu.svelte";
  import { pageMenuHost } from "$lib/menu/pageMenuHost.svelte";
  import { startMcpBridge } from "$lib/mcp/bridge";
  import { keepAwake } from "$lib/ai/keepAwakeStore.svelte";
  import { localHistory } from "$lib/localHistory/localHistory.svelte";
  import { mcpStore } from "$lib/mcp/mcpStore.svelte";
  import MergeToolApp from "$lib/merge/MergeToolApp.svelte";
  import { fileCommands } from "$lib/stores/fileCommands.svelte";
  import { isWorkspaceFile, repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { sessionSteps } from "$lib/stores/settingsData";
  import { terminalStore } from "$lib/terminal/terminalStore.svelte";
  import type { LaunchMode } from "$lib/types";
  import { toast } from "$lib/ui/toast.svelte";
  import { updates } from "$lib/update/updates.svelte";
  import Welcome from "$lib/views/Welcome.svelte";
  import { windowChrome } from "$lib/stores/windowChrome.svelte";
  import Workspace from "$lib/views/Workspace.svelte";
  import { changesSelection } from "$lib/views/changes/selection.svelte";
  import { syncWorkspaceFolders } from "$lib/views/files/previewScheme";
  import { guardWindowClose } from "$lib/windows/windowActions";
  import { MAIN_WINDOW, parseWindowStart, startStep, windowTitle } from "$lib/windows/windowSession";

  let launch = $state<LaunchMode | null>(null);
  // A browser tab has no native menu bar, so each screen shows the page's own at its top.
  $effect(() => {
    pageMenuHost.mode = isBrowserHost() && launch ? (launch.mode === "mergeTool" ? "mergeTool" : "app") : null;
  });
  /** Font size badge shown briefly while zooming with the mouse wheel. */
  let zoomBadge = $state<number | null>(null);
  let zoomBadgeTimer: ReturnType<typeof setTimeout> | undefined;
  const wheelZoom = new WheelZoom();
  let settingsLoaded = $state(false);
  /** The page asked what its window should show: from then on it reports what it shows. */
  let windowReady = $state(false);

  // The backend records git commands only while the Git Console setting is on.
  $effect(() => {
    if (!settingsLoaded) {
      return;
    }
    const enabled = settings.gitConsole;
    if (!enabled) {
      untrack(() => terminalStore.closeGitConsole());
    }
    api.gitConsoleSetEnabled(enabled).catch(() => undefined);
  });

  // The MCP server and the command line tool run while either switch is on. App windows drive
  // them (the backend keeps a running server when a window repeats the same settings); a git
  // mergetool window would compete for the same port.
  const mainWindow = $derived(settingsLoaded && launch?.mode === "app");
  $effect(() => {
    if (!mainWindow) {
      return;
    }
    const enabled = settings.mcpEnabled;
    const cliEnabled = settings.cliEnabled;
    const port = settings.mcpPort;
    const toolStates = settings.mcpTools;
    untrack(() => void mcpStore.configure(enabled, cliEnabled, port, toolStates));
  });

  $effect(() => {
    if (!mainWindow) {
      return;
    }
    return untrack(() => startMcpBridge());
  });

  // Keep computer awake follows the mode and this window's agents.
  $effect(() => {
    if (!mainWindow) {
      return;
    }
    return untrack(() => keepAwake.start());
  });

  // Tools and the image and PDF previews only reach the folders open now; the backend also
  // keeps them for the window's title, its events and the window session.
  const workspaceFolderKey = $derived((repoStore.workspace?.folders ?? []).map((folder) => folder.root).join("\n"));
  const workspaceFile = $derived(repoStore.workspace?.file ?? null);
  const workspaceTitle = $derived(windowTitle(repoStore.workspace?.name ?? null));
  $effect(() => {
    if (!mainWindow || !windowReady) {
      return;
    }
    const folderPaths = workspaceFolderKey ? workspaceFolderKey.split("\n") : [];
    syncWorkspaceFolders(folderPaths, workspaceFile, workspaceTitle);
  });

  // The debug memory log (Settings > Automation): the backend reads memory, the window reports
  // what is on screen and when scrolling starts and stops, so each change has its cause.
  $effect(() => {
    if (!mainWindow) {
      return;
    }
    const enabled = settings.memoryLogEnabled;
    const intervalMs = settings.memoryLogIntervalMs;
    const thresholdMb = settings.memoryLogThresholdMb;
    untrack(() => void memoryLog.configure(enabled, intervalMs, thresholdMb));
  });

  function logMemoryEvent(label: string): void {
    api.memoryLogEvent(label).catch(() => undefined);
  }

  $effect(() => {
    if (!mainWindow || !settings.memoryLogEnabled) {
      return;
    }
    return untrack(() => watchScrolling(logMemoryEvent));
  });

  let lastViewLabel = "";
  $effect(() => {
    if (!mainWindow || !settings.memoryLogEnabled) {
      lastViewLabel = "";
      return;
    }
    const shownView = changesSelection.shownView;
    const tabPath = shownView === "file" ? repoStore.openFilePath : null;
    const label = viewLabel({
      shownView,
      tabPath,
      markdownMode: tabPath ? (fileCommands.states[tabPath]?.markdownMode ?? null) : null,
      leftPanel: settings.leftPanel,
      bottomPanel: terminalStore.panelOpen ? terminalStore.panelTab : null,
    });
    if (label !== lastViewLabel) {
      lastViewLabel = label;
      untrack(() => logMemoryEvent(label));
    }
  });

  // Local History (Settings > Editor): the backend keeps versions only while it is on.
  $effect(() => {
    if (!mainWindow) {
      return;
    }
    const enabled = settings.localHistoryEnabled;
    const days = settings.localHistoryDays;
    const sizeMb = settings.localHistorySizeMb;
    untrack(() => localHistory.configure(enabled, days, sizeMb));
  });

  followEditorSettings();

  onMount(() => {
    settings.applyTheme();
    // Username, password and passphrase prompts of git and ssh (askpass.rs).
    askpass.start();
    windowChrome.start();
    void (async () => {
      // Shells left running by a reload of the window would otherwise leak; the ones Clear
      // Cache left for this page come back once the workspace is open.
      const terminalStash = await terminalStore.init();
      await start();
      if (terminalStash) {
        terminalStore.restoreAfterClearCache(terminalStash);
      }
    })();
    // Non-passive so the page itself does not zoom or scroll while resizing text.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      clearTimeout(zoomBadgeTimer);
    };
  });

  function onWheel(event: WheelEvent): void {
    if (!settings.mouseWheelZoom || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    if (!(event.target as HTMLElement | null)?.closest(".cm-editor")) {
      return;
    }
    event.preventDefault();
    const next = wheelZoom.apply(settings.editorFontSize, event.deltaY, event.deltaMode);
    if (next !== settings.editorFontSize) {
      settings.setPreference("editorFontSize", next);
    }
    zoomBadge = next;
    clearTimeout(zoomBadgeTimer);
    zoomBadgeTimer = setTimeout(() => {
      zoomBadge = null;
      wheelZoom.reset();
    }, 900);
  }

  async function start(): Promise<void> {
    // Recent folders and preferences come from ~/.nibtree.
    await settings.init();
    settingsLoaded = true;
    // One window checks for updates and shows What's New, not every window at once.
    if (currentWindowLabel() === MAIN_WINDOW) {
      void updates.init();
    }
    try {
      launch = await api.getLaunchMode();
    } catch (error) {
      toast.error("Could not start", errorMessage(error));
      launch = { mode: "app", repoPath: null };
      void appMenu.install("app");
      return;
    }
    void appMenu.install(launch.mode === "mergeTool" ? "mergeTool" : "app");
    if (launch.mode === "app") {
      // Closing a window asks about unsaved edits first (git mergetool has its own question).
      void guardWindowClose();
      await openForWindow(launch.repoPath);
    }
  }

  /**
   * What this window opens: its own folders (a restored window, Open Folder in New Window, or a
   * reload), the welcome screen for New Window, else the command line or the last session.
   */
  async function openForWindow(launchPath: string | null): Promise<void> {
    const start = parseWindowStart(await api.windowStartup().catch(() => null));
    const step = startStep(start, launchPath);
    // Asked first: what the window reports from now on is what a reload reopens.
    windowReady = true;
    if (step.kind === "workspaceFile") {
      await repoStore.openWorkspaceFile(step.filePath, { focusExisting: false });
    } else if (step.kind === "folders") {
      await repoStore.openFolders(step.folderPaths, null, { focusExisting: false });
    } else if (step.kind === "launch" && isWorkspaceFile(step.path)) {
      await repoStore.openWorkspaceFile(step.path);
    } else if (step.kind === "launch") {
      await repoStore.open(step.path);
    } else if (step.kind === "session") {
      await restoreSession();
    }
  }

  /** Reopens what was open at quit; nothing after an explicit Close Folder. */
  async function restoreSession(): Promise<void> {
    for (const step of sessionSteps(settings)) {
      const opened =
        step.kind === "workspaceFile"
          ? await repoStore.openWorkspaceFile(step.filePath)
          : await repoStore.openFolders(step.folderPaths);
      if (opened) {
        return;
      }
    }
  }
</script>

{#if launch?.mode === "mergeTool"}
  <MergeToolApp />
{:else if launch && repoStore.workspace}
  <Workspace />
{:else if launch}
  <Welcome />
{/if}

<svelte:window
  onkeydown={(event) => {
    // Cmd+, opens Settings, as in every macOS app. The page sees the key before the menu's
    // Settings item, and preventing it here keeps that item from opening it again. A custom
    // key for Settings goes through the window shortcuts and the menu instead.
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "," &&
      !event.defaultPrevented &&
      usesDefaultKeys("app.settings")
    ) {
      event.preventDefault();
      settings.openDialog();
    }
  }}
/>

<ZoomBadge open={zoomBadge !== null} text="Editor font size {zoomBadge ?? 0}px" />

<AppOverlays {launch} />
