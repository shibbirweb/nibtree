// Runs the UI tools (toolDefs.ts) for the MCP server and the command line tool. Loaded on the
// first request only (App.svelte imports it then), so the app pays nothing while the server
// is off. Every request gets an answer: errors become results with ok false.

import { api, errorMessage } from "$lib/api";
import { menuAccelerators } from "$lib/commands/registry";
import { usableOverrides } from "$lib/commands/shortcutSettings";
import { appMenu, currentMenuInputs } from "$lib/menu/appMenu.svelte";
import { editorFocus } from "$lib/menu/editorFocus.svelte";
import { runMenuAction } from "$lib/menu/menuActions";
import { isEditorAction, MENU_ACTIONS } from "$lib/menu/menuIds";
import { type MenuState, menuState } from "$lib/menu/menuState";
import { menuSpec } from "$lib/menu/menuSpec";
import { isMarkdownPath } from "$lib/markdown/viewMode";
import { quickOpen } from "$lib/quickOpen/quickOpenStore.svelte";
import { navBarStore } from "$lib/navBar/navBarStore.svelte";
import { recentFilesStore } from "$lib/recentFiles/recentFilesStore.svelte";
import { fileSearch } from "$lib/search/fileSearchStore.svelte";
import { runProjectScript } from "$lib/scripts/scriptActions";
import { nodePickFor, scriptRunId, withRunner } from "$lib/scripts/scriptRun";
import { scriptCommand } from "$lib/scripts/scriptsModel";
import { runnerOverrides } from "$lib/scripts/runnerOverrides.svelte";
import { fileCommands } from "$lib/stores/fileCommands.svelte";
import { navigation } from "$lib/stores/navigation.svelte";
import { isPseudoTab } from "$lib/stores/pseudoTabs";
import { isUntitledTab } from "$lib/stores/untitledTabs";
import { repoStore } from "$lib/stores/repo.svelte";
import { MARKDOWN_VIEW_MODES, SETTINGS_SECTIONS } from "$lib/stores/settingsData";
import { settings } from "$lib/stores/settings.svelte";
import { folderFor } from "$lib/stores/workspacePaths";
import { terminalStore } from "$lib/terminal/terminalStore.svelte";
import type { McpUiRequest, McpUiResult, ScriptSource } from "$lib/types";
import { updates } from "$lib/update/updates.svelte";
import { changesSelection } from "$lib/views/changes/selection.svelte";
import { buildSections, findFile } from "$lib/views/changes/sections";
import { gitDialogs } from "$lib/views/git/gitDialogs.svelte";
import { showLog } from "$lib/views/gitActions";
import { shortcutsBlocked } from "$lib/views/workspaceActions";
import { showShelf } from "$lib/shelf/shelfActions.svelte";
import { fileClipboard } from "$lib/views/files/fileClipboard.svelte";
import { inspectLayout, scrollState, scrollTrace, TRACE_AUTO_STOP_MS } from "./layoutDebug";
import { appState, openDialog, terminalInfo, terminalList } from "./appState";
import {
  capText,
  optionalBoolean,
  optionalEnum,
  optionalInteger,
  optionalPath,
  optionalString,
  requiredEnum,
  requiredInteger,
  requiredPath,
  requiredString,
  ToolArgError,
  type ToolArgs,
  toolArgs,
} from "./args";
import { helpDialogs } from "$lib/help/helpDialogs.svelte";
import { localHistory } from "$lib/localHistory/localHistory.svelte";
import { notifications } from "$lib/notifications/notifications.svelte";
import { copyPaths, createFile, createFolder, type FileToolDeps, movePaths, renamePath, trashPaths } from "./fileTools";
import { mcpStore } from "./mcpStore.svelte";
import { menuCommands } from "./menuCommands";
import { findScroller, scrollWalk, uiPerformance } from "./perf";
import {
  EDITOR_TEXT_DEFAULT_CHARS,
  EDITOR_TEXT_MAX_CHARS,
  PANELS,
  SCROLL_TARGETS,
  TERMINAL_TEXT_MAX_CHARS,
  UI_TOOLS,
} from "./toolDefs";
import { toolEnabled } from "./toolStates";

type Structured = Record<string, unknown>;
type Handler = (args: ToolArgs) => Promise<Structured> | Structured;

function result(ok: boolean, text: string, structured: Structured | null = null): McpUiResult {
  return { ok, text, structured, imagePngBase64: null };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Polls until `check` holds or the time is up. */
async function waitUntil(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) {
      return false;
    }
    await wait(50);
  }
  return true;
}

function requireWorkspace(): void {
  if (!repoStore.workspace) {
    throw new ToolArgError("No folder is open in Nibtree");
  }
}

/** UI tools check paths themselves: only the open workspace folders are reachable. */
function insideWorkspace(absolutePath: string): string {
  if (!folderFor(repoStore.workspace?.folders ?? [], absolutePath)) {
    throw new ToolArgError("Not inside an open workspace folder");
  }
  return absolutePath;
}

function requireRepository(repoPath: string): string {
  if (!repoStore.repos.some((repo) => repo.root === repoPath)) {
    throw new ToolArgError("Not an open repository; get_app_state lists them under repositories");
  }
  return repoPath;
}

/** An open file tab: the one given, else the tab on screen. */
/** The file or Untitled tab a tool acts on (File > New File tabs have an `untitled:` path, not a file path). */
function fileTab(args: ToolArgs): string {
  const raw = optionalString(args, "filePath");
  const given = raw !== null && isUntitledTab(raw) ? raw : optionalPath(args, "filePath");
  const filePath = given ?? (changesSelection.shownView === "file" ? repoStore.openFilePath : null);
  if (!filePath || (isPseudoTab(filePath) && !isUntitledTab(filePath))) {
    throw new ToolArgError(
      given ? "Not an open file tab" : "No file tab is on screen; pass filePath or open_file first",
    );
  }
  if (!repoStore.tabs.some((tab) => tab.path === filePath)) {
    throw new ToolArgError("That file is not open in a tab; open it with open_file first");
  }
  return filePath;
}

function currentMenuState(): MenuState {
  return menuState(currentMenuInputs(appMenu.menuMode));
}

function currentMenuCommands() {
  const spec = menuSpec(appMenu.menuPlatform, appMenu.menuMode);
  const accelerators = menuAccelerators(spec, usableOverrides(settings.keybindings, appMenu.menuPlatform));
  return menuCommands(spec, currentMenuState(), accelerators);
}

async function runMenuCommand(args: ToolArgs): Promise<Structured> {
  const action = requiredEnum(args, "action", MENU_ACTIONS);
  // The menu waits behind dialogs, Search Everywhere and the merge tool; say so instead of doing nothing.
  if (shortcutsBlocked()) {
    throw new ToolArgError(
      `A dialog is open in the app (${openDialog()?.kind ?? "dialog"}); it waits for the user or close_dialog`,
    );
  }
  // Find and Code items act on the focused editor: focus the file on screen first.
  if (
    isEditorAction(action) &&
    !editorFocus.focused &&
    changesSelection.shownView === "file" &&
    repoStore.openFilePath
  ) {
    fileCommands.focus(repoStore.openFilePath);
    await waitUntil(() => editorFocus.focused, 300);
  }
  const command = currentMenuCommands().find((entry) => entry.action === action);
  if (!command) {
    throw new ToolArgError(`"${action}" is not in this window's menus`);
  }
  if (!command.visible || !command.enabled) {
    throw new ToolArgError(`${command.menuPath} > ${command.label} is not available right now`);
  }
  runMenuAction(action);
  return {
    action,
    label: command.label,
    menuPath: command.menuPath,
    started: true,
    note: "Dialogs and confirmations it opens wait for the user in the app.",
  };
}

async function showPanel(args: ToolArgs): Promise<Structured> {
  const panel = requiredEnum(args, "panel", PANELS);
  const visible = optionalBoolean(args, "visible") ?? true;
  requireWorkspace();
  switch (panel) {
    case "changes":
    case "branches":
    case "scripts":
      if (visible) {
        settings.showPanel(panel);
      } else {
        settings.hidePanel(panel);
      }
      break;
    case "log":
      if (visible) {
        await showLog();
      } else if (changesSelection.logShown) {
        changesSelection.toggleLog();
      }
      break;
    case "files":
      if (visible !== settings.filesPanelShown) {
        settings.toggleExplorer();
      }
      break;
    case "ai":
      if (visible !== settings.aiPanelShown) {
        settings.toggleRightPanel("ai");
      }
      break;
    default: {
      if (panel === "gitConsole" && !settings.gitConsole) {
        throw new ToolArgError("The Git Console is turned off; turn it on in Settings > Git");
      }
      if (!visible) {
        if (terminalStore.panelOpen && terminalStore.panelTab === panel) {
          terminalStore.hide();
        }
      } else if (panel === "shelf") {
        showShelf();
      } else {
        terminalStore.showTab(panel);
      }
    }
  }
  return { panel, visible };
}

function closeDialog(): Structured {
  const shown = openDialog();
  if (!shown) {
    return { closed: null };
  }
  if (shown.kind.startsWith("question:")) {
    throw new ToolArgError(`The app is asking the user "${shown.title ?? ""}"; it waits for their answer`);
  }
  if (shown.kind === "mergeTool") {
    throw new ToolArgError("The merge tool may hold unsaved resolutions; close it in the app");
  }
  if (shown.kind.startsWith("git:")) {
    // The dialog's own Escape handling knows whether it may close while working.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    if (gitDialogs.active) {
      throw new ToolArgError("The dialog is busy and cannot close right now");
    }
    return { closed: shown.kind };
  }
  switch (shown.kind) {
    case "conflicts":
      repoStore.conflictsOpen = false;
      break;
    case "fileSearch":
      fileSearch.close();
      break;
    case "quickOpen":
      quickOpen.close();
      break;
    case "recentFiles":
      recentFilesStore.close();
      break;
    case "navigationBar":
      navBarStore.close();
      break;
    case "settings":
      settings.dialogOpen = false;
      break;
    case "keyboardShortcuts":
      helpDialogs.shortcutsOpen = false;
      break;
    case "mcpTools":
      mcpStore.toolsDialogOpen = false;
      break;
    case "whatsNew":
      updates.whatsNewOpen = false;
      break;
    case "update":
      updates.dialogOpen = false;
      break;
    case "localHistory":
      localHistory.close();
      break;
    case "notifications":
      notifications.setOpen(false);
      break;
  }
  return { closed: shown.kind };
}

async function openFile(args: ToolArgs): Promise<Structured> {
  const filePath = insideWorkspace(requiredPath(args, "filePath"));
  const line = optionalInteger(args, "line", 1, 10_000_000);
  const column = optionalInteger(args, "column", 1, 1_000_000);
  await navigation.openFileAt(filePath, line === null ? null : line - 1, column === null ? 0 : column - 1, {
    pin: true,
  });
  const opened = repoStore.openFilePath === filePath;
  if (!opened) {
    throw new ToolArgError("The file did not open (the switch was cancelled in the app)");
  }
  return { filePath, line, opened };
}

async function closeTab(args: ToolArgs): Promise<Structured> {
  const tabPath = requiredString(args, "tabPath");
  const tab = repoStore.tabs.find((entry) => entry.path === tabPath);
  if (!tab) {
    throw new ToolArgError("No tab has that path; get_app_state lists the tabs");
  }
  if (tab.dirty) {
    // The app asks the user; the answer can take longer than a tool call may wait.
    void repoStore.closeTab(tabPath);
    return { tabPath, closed: false, asked: true, note: "The tab has unsaved edits, so the app asks the user first." };
  }
  const closed = await repoStore.closeTab(tabPath);
  return { tabPath, closed };
}

function editorText(args: ToolArgs): Structured {
  const filePath = fileTab(args);
  const maxChars = optionalInteger(args, "maxChars", 1, EDITOR_TEXT_MAX_CHARS) ?? EDITOR_TEXT_DEFAULT_CHARS;
  if (fileCommands.states[filePath]?.editable === false) {
    throw new ToolArgError("That tab does not show text (binary, too large or missing)");
  }
  const text = fileCommands.text(filePath);
  if (text === null) {
    throw new ToolArgError("The editor is still loading; try again in a moment");
  }
  const capped = capText(text, maxChars);
  return {
    filePath,
    dirty: repoStore.isDirty(filePath),
    length: text.length,
    lines: text.split("\n").length,
    truncated: capped.truncated,
    text: capped.text,
  };
}

function editorSelection(args: ToolArgs): Structured {
  const filePath = fileTab(args);
  const selection = fileCommands.selection(filePath);
  if (!selection) {
    throw new ToolArgError("The editor is still loading; try again in a moment");
  }
  return { filePath, ...selection };
}

/** inspect_elements: what the window draws for a selector, to debug what the user sees. */
function inspectElements(args: ToolArgs): Structured {
  const selector = requiredString(args, "selector", 500);
  const limit = optionalInteger(args, "limit", 1, 100) ?? 20;
  const rawStyles = Array.isArray(args.styles) ? args.styles : [];
  const styles = rawStyles
    .filter((name): name is string => typeof name === "string" && /^-?[a-z][a-z-]*$/.test(name))
    .slice(0, 30);
  let found: Element[];
  try {
    found = [...document.querySelectorAll(selector)];
  } catch {
    throw new ToolArgError(`Not a valid CSS selector: ${selector}`);
  }
  const elements = found.slice(0, limit).map((element) => {
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const values: Record<string, string> = {};
    for (const name of styles) {
      values[name] = computed.getPropertyValue(name);
    }
    return {
      tag: element.tagName.toLowerCase(),
      classes: typeof element.className === "string" ? element.className : "",
      text: (element.textContent ?? "").trim().slice(0, 80),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible: rect.width > 0 && rect.height > 0 && computed.visibility !== "hidden" && computed.display !== "none",
      scroll: scrollState(element),
      styles: values,
    };
  });
  return { selector, count: found.length, elements };
}

/** How long set_markdown_mode waits for a tab opened a moment ago to finish loading. */
const MARKDOWN_LOAD_WAIT_MS = 3000;

async function setMarkdownMode(args: ToolArgs): Promise<Structured> {
  const mode = requiredEnum(args, "mode", MARKDOWN_VIEW_MODES);
  const filePath = fileTab(args);
  if (!isMarkdownPath(filePath)) {
    throw new ToolArgError("That tab is not a Markdown file");
  }
  // Right after open_file the editor is still loading and has not reported its Markdown mode.
  const deadline = performance.now() + MARKDOWN_LOAD_WAIT_MS;
  while ((fileCommands.states[filePath]?.markdownMode ?? null) === null && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if ((fileCommands.states[filePath]?.markdownMode ?? null) === null) {
    throw new ToolArgError("The Markdown file is still loading or could not be shown; try again in a moment");
  }
  fileCommands.setViewMode(filePath, mode);
  return { filePath, mode };
}

async function saveFile(args: ToolArgs): Promise<Structured> {
  const filePath = fileTab(args);
  if (!repoStore.isDirty(filePath)) {
    return { filePath, saved: false, note: "No unsaved edits" };
  }
  if (isUntitledTab(filePath)) {
    // The save dialog waits for the user, longer than a tool call may wait.
    void fileCommands.save(filePath, { quiet: true });
    return {
      filePath,
      saved: false,
      asked: true,
      note: "An Untitled tab has no file yet, so the app asks the user where to save it.",
    };
  }
  const saved = await fileCommands.save(filePath, { quiet: true });
  if (!saved) {
    throw new ToolArgError("The file could not be saved; the app shows why");
  }
  return { filePath, saved };
}

async function showCommit(args: ToolArgs): Promise<Structured> {
  const repoPath = requireRepository(requiredPath(args, "repoPath"));
  const revision = requiredString(args, "commitId", 256);
  const filePath = optionalString(args, "filePath");
  const commitId = await api.resolveRevision(repoPath, revision);
  await repoStore.showCommit(repoPath, commitId, filePath || null);
  return { repoPath, commitId, filePath: filePath || null };
}

function showChangesDiff(args: ToolArgs): Structured {
  const repoPath = requireRepository(requiredPath(args, "repoPath"));
  const filePath = requiredString(args, "filePath");
  const area = optionalBoolean(args, "staged") ? "staged" : "unstaged";
  const selection = { repoRoot: repoPath, path: filePath, area } as const;
  if (!findFile(buildSections(repoStore.repos, repoStore.statuses), selection)) {
    throw new ToolArgError(`That file has no ${area} change`);
  }
  changesSelection.pick(selection);
  return { repoPath, filePath, area };
}

async function loadScripts(): Promise<{
  sources: ScriptSource[];
  installs: Awaited<ReturnType<typeof api.listNodeVersions>>;
}> {
  requireWorkspace();
  const folderPaths = (repoStore.workspace?.folders ?? []).map((folder) => folder.root);
  const [found, installs] = await Promise.all([
    api.listProjectScripts(folderPaths),
    api.listNodeVersions().catch(() => []),
  ]);
  return {
    sources: (found ?? []).map((source) => withRunner(source, runnerOverrides.get(source.filePath))),
    installs: installs ?? [],
  };
}

async function listScripts(): Promise<Structured> {
  const { sources, installs } = await loadScripts();
  return {
    sources: sources.map((source) => {
      const pick = nodePickFor(source, installs, settings.scriptNodeVersions);
      return {
        manifestPath: source.filePath,
        kind: source.kind,
        folderPath: source.folderPath,
        runner: source.runner,
        packageName: source.packageName,
        error: source.error,
        node: pick
          ? {
              version: pick.install?.version ?? null,
              manager: pick.install?.manager ?? null,
              choice: pick.mode,
              wanted: pick.wanted?.spec ?? null,
              missing: pick.missing,
            }
          : null,
        scripts: source.scripts.map((script) => ({
          name: script.name,
          runs: scriptCommand(source.kind, source.runner, script.name),
          command: script.command,
        })),
      };
    }),
  };
}

async function runScript(args: ToolArgs): Promise<Structured> {
  const manifestPath = insideWorkspace(requiredPath(args, "manifestPath"));
  const scriptName = requiredString(args, "scriptName", 512);
  const { sources, installs } = await loadScripts();
  const source = sources.find((entry) => entry.filePath === manifestPath);
  if (!source) {
    throw new ToolArgError("No scripts file at that path; list_scripts gives the paths");
  }
  const script = source.scripts.find((entry) => entry.name === scriptName);
  if (!script) {
    throw new ToolArgError(`That file has no script named "${scriptName}"`);
  }
  const runId = scriptRunId(source, script);
  const running = terminalStore.runSessions.find(
    (entry) => entry.run?.runId === runId && entry.terminalId !== null && !entry.exited,
  );
  if (running) {
    throw new ToolArgError(`It is still running in the Run tab (runKey ${running.key}); stop it with stop_run first`);
  }
  await runProjectScript(source, script, installs, false);
  const session = terminalStore.runSessions.find((entry) => entry.run?.runId === runId) ?? null;
  return { started: session !== null, session: session ? terminalInfo(session) : null };
}

function stopRun(args: ToolArgs): Structured {
  const runKey = optionalInteger(args, "runKey", 1, Number.MAX_SAFE_INTEGER) ?? terminalStore.runActiveKey;
  const entry = runKey === null ? null : terminalStore.find(runKey);
  if (!entry || entry.location !== "run") {
    throw new ToolArgError("No such run session; list_terminals lists them");
  }
  const running = entry.terminalId !== null && !entry.exited;
  terminalStore.stopRun(entry.key);
  return { runKey: entry.key, stopped: running, note: running ? null : "It was not running" };
}

async function newTerminal(args: ToolArgs): Promise<Structured> {
  requireWorkspace();
  const folderPath = optionalPath(args, "folderPath");
  if (folderPath) {
    insideWorkspace(folderPath);
  }
  const location = optionalEnum(args, "location", ["panel", "editor"] as const) ?? "panel";
  const before = new Set(terminalStore.terminals.map((terminal) => terminal.key));
  await terminalStore.create({ folderPath, location });
  const created = terminalStore.terminals.find((terminal) => !before.has(terminal.key)) ?? null;
  if (!created) {
    throw new ToolArgError("The terminal did not start");
  }
  // The shell starts once its view mounts; give it a moment so the key can take text at once.
  await waitUntil(() => (terminalStore.find(created.key)?.terminalId ?? null) !== null, 3000);
  return terminalInfo(terminalStore.find(created.key) ?? created);
}

async function sendTerminalText(args: ToolArgs): Promise<Structured> {
  const terminalKey = requiredInteger(args, "terminalKey", 1, Number.MAX_SAFE_INTEGER);
  const text = optionalString(args, "text", TERMINAL_TEXT_MAX_CHARS);
  if (text === null) {
    throw new ToolArgError('"text" is required');
  }
  const pressEnter = optionalBoolean(args, "pressEnter") ?? true;
  if (!terminalStore.find(terminalKey)) {
    throw new ToolArgError("No terminal has that key; list_terminals lists them");
  }
  await waitUntil(() => (terminalStore.find(terminalKey)?.terminalId ?? null) !== null, 3000);
  const entry = terminalStore.find(terminalKey);
  if (!entry || entry.terminalId === null || entry.exited) {
    throw new ToolArgError("That terminal is not running");
  }
  await api.terminalWrite(entry.terminalId, pressEnter ? `${text}\r` : text);
  return { terminalKey, sent: text.length, pressedEnter: pressEnter };
}

async function scrollView(args: ToolArgs): Promise<Structured> {
  const target = requiredEnum(args, "target", SCROLL_TARGETS);
  const speed = optionalInteger(args, "speed", 5, 2000) ?? 80;
  const rounds = optionalInteger(args, "rounds", 1, 10) ?? 1;
  const element = findScroller(target);
  if (!element) {
    throw new ToolArgError(
      `Nothing scrollable is visible for "${target}"; show it first (for example open a long file)`,
    );
  }
  const outcome = await scrollWalk(element, speed, rounds);
  return { target, ...outcome };
}

/** The file tools act through the same api calls and repoStore helpers as the Files panel. */
const fileToolDeps: FileToolDeps = {
  folders: () => repoStore.workspace?.folders ?? [],
  dirtyPaths: () => repoStore.dirtyPaths,
  fileCreate: api.fileCreate,
  fileRename: api.fileRename,
  fileCopy: api.fileCopy,
  fileMove: api.fileMove,
  fileTrash: api.fileTrash,
  openFile: async (filePath) => {
    await repoStore.openFile(filePath, { pin: true });
    return repoStore.openFilePath === filePath;
  },
  retargetTabs: (moves) => repoStore.retargetTabs(moves),
  closeTabsUnder: (entryPaths) => repoStore.closeTabsUnder(entryPaths),
  clipboardFollow: (moves) => fileClipboard.follow(moves),
  clipboardForget: (removed) => fileClipboard.forget(removed),
  filesWritten: (changedPaths) => repoStore.filesWritten(changedPaths),
};

const HANDLERS: Record<string, Handler> = {
  get_app_state: () => appState(),
  list_menu_commands: () => ({ commands: currentMenuCommands() }),
  run_menu_command: runMenuCommand,
  show_panel: showPanel,
  open_settings: (args) => {
    const section = optionalEnum(args, "section", SETTINGS_SECTIONS) ?? "appearance";
    settings.openDialog(section);
    return { section };
  },
  close_dialog: () => closeDialog(),
  set_active_repository: async (args) => {
    const repoPath = requireRepository(requiredPath(args, "repoPath"));
    await repoStore.setActiveRepo(repoPath);
    return { activeRepository: repoStore.repo?.root ?? null };
  },
  open_file: openFile,
  close_tab: closeTab,
  get_editor_text: editorText,
  get_editor_selection: editorSelection,
  set_markdown_mode: setMarkdownMode,
  save_file: saveFile,
  create_file: (args) => createFile(fileToolDeps, args),
  create_folder: (args) => createFolder(fileToolDeps, args),
  rename_path: (args) => renamePath(fileToolDeps, args),
  copy_paths: (args) => copyPaths(fileToolDeps, args),
  move_paths: (args) => movePaths(fileToolDeps, args),
  trash_paths: (args) => trashPaths(fileToolDeps, args),
  show_commit: showCommit,
  show_changes_diff: showChangesDiff,
  list_scripts: () => listScripts(),
  run_script: runScript,
  stop_run: stopRun,
  list_terminals: () => terminalList(),
  new_terminal: newTerminal,
  send_terminal_text: sendTerminalText,
  get_ui_performance: (args) => uiPerformance(optionalInteger(args, "sampleMs", 0, 5000) ?? 500),
  inspect_elements: (args) => inspectElements(args),
  scroll_view: scrollView,
  inspect_layout: () => inspectLayout(),
  trace_scrolls: (args) => {
    if (requiredEnum(args, "action", ["start", "stop"] as const) === "start") {
      scrollTrace.start();
      return { tracing: true, autoStopMs: TRACE_AUTO_STOP_MS };
    }
    return scrollTrace.stop();
  },
};

/** Answers one request; never throws. */
export async function handleUiRequest(request: McpUiRequest): Promise<McpUiResult> {
  const definition = UI_TOOLS.find((tool) => tool.name === request.tool);
  const handler = HANDLERS[request.tool];
  if (!definition || !handler) {
    return result(false, `Unknown UI tool "${request.tool}"`);
  }
  if (!toolEnabled(definition, settings.mcpTools)) {
    return result(false, "This tool is turned off in Nibtree (Help > Available MCP Tools).");
  }
  try {
    const structured = await handler(toolArgs(request.arguments));
    return result(true, JSON.stringify(structured, null, 2), structured);
  } catch (error) {
    return result(false, error instanceof ToolArgError ? error.message : errorMessage(error));
  }
}
