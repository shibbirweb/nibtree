// User preferences and UI state, stored in the home folder:
//   ~/.nibtree/settings.json   preferences shown in the Settings dialog
//   ~/.nibtree/state.json      recent folders, panel sizes and similar
// Values are validated on load so a hand-edited file can never break the app,
// and unknown keys are preserved on save. A file that fails to parse only
// affects itself and is never overwritten automatically. The pure parts live
// in settingsData.ts.
//
// Every window holds a copy. A save sends only what this window changed since it last
// wrote or heard of the file (configPatch.ts); the backend writes that into the file as it
// is on disk and tells the other windows, which apply it, so a setting changed in one
// window reaches all of them and no window writes back another's older values. A window's
// own layout (WINDOW_STATE_KEYS) is not taken from the others.

import type { AgentOverride } from "$lib/ai/agentConfig";
import { api, errorMessage, onConfigChanged } from "$lib/api";
import { pushRecentCommand } from "$lib/commands/recentCommands";
import type { ShortcutOverrides } from "$lib/commands/registry";
import { applyColorTheme } from "$lib/themes/apply";
import { type ColorMode, effectiveMode, pickThemeId } from "@nibtree/ui/themes/themeIndex";
import { toast } from "$lib/ui/toast.svelte";
import { type RecentFile, withRecentFiles } from "./recentFiles";
import { type SavedTabSession, withTabSession } from "./tabSession";
import {
  type ConfigPatch,
  cloneJson,
  diffJson,
  isEmptyPatch,
  type JsonObject,
  parsePatch,
  rebaseIncoming,
  withoutKeys,
} from "./configPatch";
import {
  asObject,
  type AutoSaveMode,
  changedPreferenceKeys,
  type CommitBoxLayout,
  type AiPermissionMode,
  type AiUsagePosition,
  type AiUsageProvider,
  type ComputerAwakeMode,
  type ConfigName,
  type DiffLayout,
  type DiffPanes,
  type MergeLayout,
  type Json,
  type LeftPanel,
  type LoadErrors,
  type RightPanel,
  MARKDOWN_PREVIEW_RATIO_RANGE,
  type MarkdownViewMode,
  MAX_RECENT,
  MAX_SCRIPT_NODE_VERSIONS,
  type EditorCursorBlinking,
  type EditorCursorStyle,
  parsePreferences,
  parseState,
  type Preferences,
  type RenderWhitespace,
  type SettingsSection,
  shouldMigrateLegacy,
  stateToJson,
  type TerminalCursorStyle,
  type TerminalFontWeight,
  type ThemeSetting,
  type UiState,
  type UpdateChannelSetting,
  type UpdateMethod,
  WINDOW_STATE_KEYS,
  writableConfigs,
} from "./settingsData";
import type { CommitGpgSign, FileIconMode, FileToolbarPlacement } from "./settingsData";
import { type MessageHistory, rememberInHistory } from "../views/changes/commitMessages";
import type { CommitTemplate } from "../views/changes/commitTemplates";

export {
  LOCAL_HISTORY_DAYS_RANGE,
  LOCAL_HISTORY_SIZE_MB_RANGE,
  MEMORY_LOG_INTERVAL_RANGE,
  MEMORY_LOG_THRESHOLD_RANGE,
  clampTerminalScrollback,
  DEFAULT_EDITOR_FONT,
  DEFAULT_MARKDOWN_PREVIEW_RATIO,
  DEFAULT_MCP_PORT,
  DEFAULT_PANEL_WIDTH,
  DEFAULT_RULER_COLUMN,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_LIST_WIDTH,
  DEFAULT_CHANGES_LIST_WIDTH,
  defaultPreferences,
  CARET_EXTRA_RANGE,
  COMMIT_BOX_LAYOUT_CHOICES,
  DIFF_LAYOUT_CHOICES,
  DIFF_PANES_CHOICES,
  MERGE_LAYOUT_CHOICES,
  EDITOR_CURSOR_BLINKING_CHOICES,
  EDITOR_CURSOR_STYLE_CHOICES,
  EDITOR_CURSOR_WIDTH_RANGE,
  EDITOR_FONT_WEIGHT_RANGE,
  EDITOR_LINE_HEIGHT_RANGE,
  EDITOR_RULER_RANGE,
  FILE_ICON_CHOICES,
  FILE_TOOLBAR_CHOICES,
  FILE_TOOLBAR_SWITCHES,
  FONT_SIZE_RANGE,
  fontWeightName,
  MARKDOWN_PREVIEW_RATIO_RANGE,
  MARKDOWN_VIEW_MODES,
  MCP_PORT_RANGE,
  MIN_TERMINAL_HEIGHT,
  MIN_TERMINAL_LIST_WIDTH,
  MIN_CHANGES_LIST_WIDTH,
  MONOSPACE_FONTS,
  normalizeFontFamily,
  normalizeTerminalFontFamily,
  parseMcpPort,
  pickRulerColumn,
  RENDER_WHITESPACE_CHOICES,
  SETTINGS_SECTIONS,
  TAB_SIZES,
  TERMINAL_CURSOR_STYLES,
  TERMINAL_FONT_WEIGHTS,
  TERMINAL_LETTER_SPACING_RANGE,
  TERMINAL_LINE_HEIGHT_RANGE,
  TERMINAL_SCROLLBACK_RANGE,
} from "./settingsData";
export type {
  AutoSaveMode,
  CommitBoxLayout,
  DiffLayout,
  DiffPanes,
  EditorCursorBlinking,
  EditorCursorStyle,
  LeftPanel,
  MarkdownViewMode,
  Preferences,
  RightPanel,
  RenderWhitespace,
  SettingsSection,
  TerminalCursorStyle,
  TerminalFontWeight,
  ThemeSetting,
  UpdateChannelSetting,
  UpdateMethod,
} from "./settingsData";

const SAVE_DELAY_MS = 200;
/** Where settings lived before ~/.nibtree existed; migrated once. */
const LEGACY_STORAGE_KEY = "git-merger:settings";

const initialPreferences = parsePreferences({}).preferences;
const initialState = parseState({}).state;

class SettingsStore {
  // Preferences (settings.json)
  theme = $state<ThemeSetting>(initialPreferences.theme);
  lightColorTheme = $state(initialPreferences.lightColorTheme);
  darkColorTheme = $state(initialPreferences.darkColorTheme);
  uiFontSize = $state(initialPreferences.uiFontSize);
  fileIcons = $state<FileIconMode>(initialPreferences.fileIcons);
  roundedPanels = $state(initialPreferences.roundedPanels);
  projectColorHeader = $state(initialPreferences.projectColorHeader);
  fileToolbar = $state<FileToolbarPlacement>(initialPreferences.fileToolbar);
  fileToolbarBreadcrumbs = $state(initialPreferences.fileToolbarBreadcrumbs);
  fileToolbarBadges = $state(initialPreferences.fileToolbarBadges);
  fileToolbarChanges = $state(initialPreferences.fileToolbarChanges);
  fileToolbarBlame = $state(initialPreferences.fileToolbarBlame);
  fileToolbarCopyPath = $state(initialPreferences.fileToolbarCopyPath);
  fileToolbarMarkdownView = $state(initialPreferences.fileToolbarMarkdownView);
  fileToolbarMarkdownFormat = $state(initialPreferences.fileToolbarMarkdownFormat);
  editorFontSize = $state(initialPreferences.editorFontSize);
  editorLineHeight = $state(initialPreferences.editorLineHeight);
  editorFontFamily = $state(initialPreferences.editorFontFamily);
  editorFontWeight = $state(initialPreferences.editorFontWeight);
  fontLigatures = $state(initialPreferences.fontLigatures);
  syntaxHighlighting = $state(initialPreferences.syntaxHighlighting);
  tabSize = $state(initialPreferences.tabSize);
  detectIndentation = $state(initialPreferences.detectIndentation);
  wordWrap = $state(initialPreferences.wordWrap);
  renderWhitespace = $state<RenderWhitespace>(initialPreferences.renderWhitespace);
  editorCursorStyle = $state<EditorCursorStyle>(initialPreferences.editorCursorStyle);
  editorCursorWidth = $state(initialPreferences.editorCursorWidth);
  editorCursorBlinking = $state<EditorCursorBlinking>(initialPreferences.editorCursorBlinking);
  editorCursorSmoothCaret = $state(initialPreferences.editorCursorSmoothCaret);
  editorCaretExtraTop = $state(initialPreferences.editorCaretExtraTop);
  editorCaretExtraBottom = $state(initialPreferences.editorCaretExtraBottom);
  editorAutoCloseBrackets = $state(initialPreferences.editorAutoCloseBrackets);
  editorCompletion = $state(initialPreferences.editorCompletion);
  editorCompletionOnTyping = $state(initialPreferences.editorCompletionOnTyping);
  editorFoldGutter = $state(initialPreferences.editorFoldGutter);
  editorIndentGuides = $state(initialPreferences.editorIndentGuides);
  editorHighlightWord = $state(initialPreferences.editorHighlightWord);
  editorScrollPastEnd = $state(initialPreferences.editorScrollPastEnd);
  editorColumnSelection = $state(initialPreferences.editorColumnSelection);
  editorStickyScroll = $state(initialPreferences.editorStickyScroll);
  editorMinimap = $state(initialPreferences.editorMinimap);
  editorBracketPairColors = $state(initialPreferences.editorBracketPairColors);
  editorMatchBrackets = $state(initialPreferences.editorMatchBrackets);
  editorRulerColumn = $state(initialPreferences.editorRulerColumn);
  reopenTabsOnStart = $state(initialPreferences.reopenTabsOnStart);
  recentFiles = $state(initialPreferences.recentFiles);
  reopenWindows = $state(initialPreferences.reopenWindows);
  tabLimit = $state(initialPreferences.tabLimit);
  unloadHiddenTabs = $state(initialPreferences.unloadHiddenTabs);
  unloadHiddenTabsMinutes = $state(initialPreferences.unloadHiddenTabsMinutes);
  splitEditor = $state(initialPreferences.splitEditor);
  wrapTabs = $state(initialPreferences.wrapTabs);
  singleTabTitle = $state(initialPreferences.singleTabTitle);
  autoSave = $state<AutoSaveMode>(initialPreferences.autoSave);
  autoSaveDelayMs = $state(initialPreferences.autoSaveDelayMs);
  rememberUnsaved = $state(initialPreferences.rememberUnsaved);
  trimTrailingWhitespace = $state(initialPreferences.trimTrailingWhitespace);
  insertFinalNewline = $state(initialPreferences.insertFinalNewline);
  trimFinalNewlines = $state(initialPreferences.trimFinalNewlines);
  currentLineBlame = $state(initialPreferences.currentLineBlame);
  blameGutter = $state(initialPreferences.blameGutter);
  mouseWheelZoom = $state(initialPreferences.mouseWheelZoom);
  checkForUpdates = $state(initialPreferences.checkForUpdates);
  updateChannel = $state<UpdateChannelSetting>(initialPreferences.updateChannel);
  ignoreWhitespace = $state(initialPreferences.ignoreWhitespace);
  diffLayout = $state<DiffLayout>(initialPreferences.diffLayout);
  changesDiffPanes = $state<DiffPanes>(initialPreferences.changesDiffPanes);
  mergeDiffPanes = $state<DiffPanes>(initialPreferences.mergeDiffPanes);
  mergeLayout = $state<MergeLayout>(initialPreferences.mergeLayout);
  logAllRefs = $state(initialPreferences.logAllRefs);
  autoFetch = $state(initialPreferences.autoFetch);
  autoFetchIntervalMinutes = $state(initialPreferences.autoFetchIntervalMinutes);
  updateMethod = $state<UpdateMethod>(initialPreferences.updateMethod);
  commitSignOff = $state(initialPreferences.commitSignOff);
  commitGpgSign = $state<CommitGpgSign>(initialPreferences.commitGpgSign);
  commitMessageHistory = $state(initialPreferences.commitMessageHistory);
  commitSubjectGuide = $state(initialPreferences.commitSubjectGuide);
  commitBoxLayout = $state<CommitBoxLayout>(initialPreferences.commitBoxLayout);
  commitTemplates = $state.raw<CommitTemplate[]>(initialPreferences.commitTemplates);
  gitConsole = $state(initialPreferences.gitConsole);
  terminalShell = $state<string | null>(initialPreferences.terminalShell);
  terminalFontFamily = $state(initialPreferences.terminalFontFamily);
  terminalFontSize = $state(initialPreferences.terminalFontSize);
  terminalLineHeight = $state(initialPreferences.terminalLineHeight);
  terminalLetterSpacing = $state(initialPreferences.terminalLetterSpacing);
  terminalFontWeight = $state<TerminalFontWeight>(initialPreferences.terminalFontWeight);
  terminalFontWeightBold = $state<TerminalFontWeight>(initialPreferences.terminalFontWeightBold);
  terminalLigatures = $state(initialPreferences.terminalLigatures);
  terminalNerdFontIcons = $state(initialPreferences.terminalNerdFontIcons);
  terminalCursorStyle = $state<TerminalCursorStyle>(initialPreferences.terminalCursorStyle);
  terminalCursorBlink = $state(initialPreferences.terminalCursorBlink);
  terminalScrollback = $state(initialPreferences.terminalScrollback);
  terminalCopyOnSelect = $state(initialPreferences.terminalCopyOnSelect);
  terminalFind = $state(initialPreferences.terminalFind);
  terminalFileLinks = $state(initialPreferences.terminalFileLinks);
  terminalGpuAcceleration = $state(initialPreferences.terminalGpuAcceleration);
  terminalUnicode11 = $state(initialPreferences.terminalUnicode11);
  terminalOptionAsMeta = $state(initialPreferences.terminalOptionAsMeta);
  terminalVisualBell = $state(initialPreferences.terminalVisualBell);
  terminalSmoothScrolling = $state(initialPreferences.terminalSmoothScrolling);
  terminalDropPaths = $state(initialPreferences.terminalDropPaths);
  markdownViewMode = $state<MarkdownViewMode>(initialPreferences.markdownViewMode);
  confirmDragAndDrop = $state(initialPreferences.confirmDragAndDrop);
  mcpEnabled = $state(initialPreferences.mcpEnabled);
  cliEnabled = $state(initialPreferences.cliEnabled);
  memoryLogEnabled = $state(initialPreferences.memoryLogEnabled);
  memoryLogIntervalMs = $state(initialPreferences.memoryLogIntervalMs);
  memoryLogThresholdMb = $state(initialPreferences.memoryLogThresholdMb);
  localHistoryEnabled = $state(initialPreferences.localHistoryEnabled);
  localHistoryDays = $state(initialPreferences.localHistoryDays);
  localHistorySizeMb = $state(initialPreferences.localHistorySizeMb);
  notificationsDoNotDisturb = $state(initialPreferences.notificationsDoNotDisturb);
  mcpPort = $state(initialPreferences.mcpPort);
  mcpTools = $state.raw<Record<string, boolean>>(initialPreferences.mcpTools);
  /** Custom keyboard shortcuts by command id; replaced as a whole on every change. */
  keybindings = $state.raw<ShortcutOverrides>(initialPreferences.keybindings);
  aiPermissionMode = $state<AiPermissionMode>(initialPreferences.aiPermissionMode);
  aiAgentArgs = $state.raw<Record<string, string>>(initialPreferences.aiAgentArgs);
  aiDefaultAgent = $state(initialPreferences.aiDefaultAgent);
  aiWorktreeLinks = $state.raw<string[]>(initialPreferences.aiWorktreeLinks);
  aiUsagePosition = $state<AiUsagePosition>(initialPreferences.aiUsagePosition);
  aiUsageHidden = $state.raw<AiUsageProvider[]>(initialPreferences.aiUsageHidden);
  computerAwakeMode = $state<ComputerAwakeMode>(initialPreferences.computerAwakeMode);
  aiAgentCommands = $state.raw<Record<string, AgentOverride>>(initialPreferences.aiAgentCommands);

  // UI state (state.json)
  recentRepos = $state<string[]>(initialState.recentRepos);
  /** Recent multi-folder workspaces, each a list of folder roots. */
  recentWorkspaces = $state<string[][]>(initialState.recentWorkspaces);
  /** Folders open when the app last closed, reopened on start. */
  lastSession = $state<string[]>(initialState.lastSession);
  /** Workspace file open when the app last closed; takes priority over `lastSession`. */
  lastSessionFile = $state<string | null>(initialState.lastSessionFile);
  /** state.json recorded a session; an empty one means the folder was closed on purpose. */
  sessionRecorded = $state(initialState.sessionRecorded);
  /** Recently used workspace files. */
  recentWorkspaceFiles = $state<string[]>(initialState.recentWorkspaceFiles);
  /** Version that last ran, to show What's New once after an update. */
  lastRunVersion = $state<string | null>(initialState.lastRunVersion);
  /** A release the user chose to skip; it is not announced again. */
  skippedVersion = $state<string | null>(initialState.skippedVersion);
  activeRepos = $state<Record<string, string>>(initialState.activeRepos);
  activeRepoAuto = $state(initialState.activeRepoAuto);
  scriptNodeVersions = $state<Record<string, string>>(initialState.scriptNodeVersions);
  explorerOpen = $state(initialState.explorerOpen);
  rightPanel = $state<RightPanel>(initialState.rightPanel);
  leftBarVisible = $state(initialState.leftBarVisible);
  rightBarVisible = $state(initialState.rightBarVisible);
  diffSplitRatio = $state(initialState.diffSplitRatio);
  threePaneSplit = $state.raw(initialState.threePaneSplit);
  mergeStackHeight = $state(initialState.mergeStackHeight);
  mergeStackRatio = $state(initialState.mergeStackRatio);
  leftPanel = $state<LeftPanel>(initialState.leftPanel);
  sidebarWidth = $state(initialState.sidebarWidth);
  explorerWidth = $state(initialState.explorerWidth);
  commitInfoHeight = $state(initialState.commitInfoHeight);
  terminalHeight = $state(initialState.terminalHeight);
  terminalListWidth = $state(initialState.terminalListWidth);
  changesListWidth = $state(initialState.changesListWidth);
  changesListVisible = $state(initialState.changesListVisible);
  markdownPreviewRatio = $state(initialState.markdownPreviewRatio);
  /** Command Palette: recently used command ids, most recent first. */
  recentCommands = $state.raw<string[]>(initialState.recentCommands);
  /** Commit box message history by repository root (see views/changes/commitMessages.ts). */
  commitMessages = $state.raw<MessageHistory>(initialState.commitMessages);
  /** File tabs of each workspace, by workspace id (Reopen tabs on start). Not reactive: only read when a workspace opens. */
  openTabs: Record<string, SavedTabSession> = initialState.openTabs;
  /** Recent Files of each workspace, by workspace id. Not reactive: read when a workspace opens. */
  recentFileLists: Record<string, RecentFile[]> = initialState.recentFileLists;

  /** macOS is in dark mode; followed while `theme` is "system". */
  systemDark = $state(false);
  private systemMedia: MediaQueryList | null = null;

  /** The Settings dialog is open (not saved). */
  dialogOpen = $state(false);
  /** Section the Settings dialog opens on. */
  dialogSection = $state<SettingsSection>("appearance");

  /** The ~/.nibtree folder, once known. */
  configDir = $state<string | null>(null);
  /** Set when settings.json could not be read, e.g. after a hand edit with a typo. */
  loadError = $state<string | null>(null);
  /** Set when state.json could not be read; it is then left as it is until reset. */
  stateLoadError = $state<string | null>(null);

  private extraPreferences: Json = {};
  private extraState: Json = {};
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveFailed = false;
  /** Each file as this window last wrote or heard of it; a save sends only the difference. */
  private synced: Record<ConfigName, JsonObject> = { settings: {}, state: {} };
  private listening = false;

  /** Loads both files; migrates the old browser-storage settings on first run. */
  async init(): Promise<void> {
    try {
      this.configDir = await api.configDir();
    } catch {
      this.configDir = null;
    }
    // Each file is read on its own so a typo in one never resets the other.
    const [preferences, state] = await Promise.all([this.loadFile("settings"), this.loadFile("state")]);
    this.loadError = preferences.error;
    this.stateLoadError = state.error;
    const loaded = { settings: preferences.value, state: state.value };
    if (shouldMigrateLegacy(loaded, this.loadErrors)) {
      const legacy = this.readLegacy();
      if (legacy) {
        this.applyPreferences(legacy);
        this.applyState(legacy);
        // Nothing is on disk yet: the first save writes everything.
        this.flush();
      }
    } else {
      this.applyPreferences(preferences.value);
      this.applyState(state.value);
      this.synced = { settings: this.fileJson("settings"), state: this.fileJson("state") };
    }
    this.listenToOtherWindows();
    this.applyAppearance();
    if (this.loadError || this.stateLoadError) {
      const file =
        this.loadError && this.stateLoadError
          ? "settings.json and state.json"
          : this.loadError
            ? "settings.json"
            : "state.json";
      toast.error(`${file} could not be read`, "It is left as it is. Open Settings to try again or reset it.");
    }
  }

  private async loadFile(configName: ConfigName): Promise<{ value: unknown; error: string | null }> {
    try {
      return { value: await api.loadConfig(configName), error: null };
    } catch (error) {
      return { value: null, error: errorMessage(error) };
    }
  }

  private get loadErrors(): LoadErrors {
    return { settings: this.loadError, state: this.stateLoadError };
  }

  private readLegacy(): Json | null {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      return raw ? asObject(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private applyPreferences(value: unknown): void {
    const { preferences, extra } = parsePreferences(value);
    Object.assign(this, preferences);
    this.extraPreferences = extra;
  }

  private applyState(value: unknown): void {
    const { state, extra } = parseState(value);
    Object.assign(this, state);
    this.extraState = extra;
  }

  preferences(): Preferences {
    return {
      theme: this.theme,
      lightColorTheme: this.lightColorTheme,
      darkColorTheme: this.darkColorTheme,
      uiFontSize: this.uiFontSize,
      fileIcons: this.fileIcons,
      roundedPanels: this.roundedPanels,
      projectColorHeader: this.projectColorHeader,
      fileToolbar: this.fileToolbar,
      fileToolbarBreadcrumbs: this.fileToolbarBreadcrumbs,
      fileToolbarBadges: this.fileToolbarBadges,
      fileToolbarChanges: this.fileToolbarChanges,
      fileToolbarBlame: this.fileToolbarBlame,
      fileToolbarCopyPath: this.fileToolbarCopyPath,
      fileToolbarMarkdownView: this.fileToolbarMarkdownView,
      fileToolbarMarkdownFormat: this.fileToolbarMarkdownFormat,
      editorFontSize: this.editorFontSize,
      editorLineHeight: this.editorLineHeight,
      editorFontFamily: this.editorFontFamily,
      editorFontWeight: this.editorFontWeight,
      fontLigatures: this.fontLigatures,
      syntaxHighlighting: this.syntaxHighlighting,
      tabSize: this.tabSize,
      detectIndentation: this.detectIndentation,
      wordWrap: this.wordWrap,
      renderWhitespace: this.renderWhitespace,
      editorCursorStyle: this.editorCursorStyle,
      editorCursorWidth: this.editorCursorWidth,
      editorCursorBlinking: this.editorCursorBlinking,
      editorCursorSmoothCaret: this.editorCursorSmoothCaret,
      editorCaretExtraTop: this.editorCaretExtraTop,
      editorCaretExtraBottom: this.editorCaretExtraBottom,
      editorAutoCloseBrackets: this.editorAutoCloseBrackets,
      editorCompletion: this.editorCompletion,
      editorCompletionOnTyping: this.editorCompletionOnTyping,
      editorFoldGutter: this.editorFoldGutter,
      editorIndentGuides: this.editorIndentGuides,
      editorHighlightWord: this.editorHighlightWord,
      editorScrollPastEnd: this.editorScrollPastEnd,
      editorColumnSelection: this.editorColumnSelection,
      editorStickyScroll: this.editorStickyScroll,
      editorMinimap: this.editorMinimap,
      editorBracketPairColors: this.editorBracketPairColors,
      editorMatchBrackets: this.editorMatchBrackets,
      editorRulerColumn: this.editorRulerColumn,
      reopenTabsOnStart: this.reopenTabsOnStart,
      recentFiles: this.recentFiles,
      reopenWindows: this.reopenWindows,
      tabLimit: this.tabLimit,
      unloadHiddenTabs: this.unloadHiddenTabs,
      unloadHiddenTabsMinutes: this.unloadHiddenTabsMinutes,
      splitEditor: this.splitEditor,
      wrapTabs: this.wrapTabs,
      singleTabTitle: this.singleTabTitle,
      autoSave: this.autoSave,
      autoSaveDelayMs: this.autoSaveDelayMs,
      rememberUnsaved: this.rememberUnsaved,
      trimTrailingWhitespace: this.trimTrailingWhitespace,
      insertFinalNewline: this.insertFinalNewline,
      trimFinalNewlines: this.trimFinalNewlines,
      currentLineBlame: this.currentLineBlame,
      blameGutter: this.blameGutter,
      mouseWheelZoom: this.mouseWheelZoom,
      checkForUpdates: this.checkForUpdates,
      updateChannel: this.updateChannel,
      ignoreWhitespace: this.ignoreWhitespace,
      diffLayout: this.diffLayout,
      changesDiffPanes: this.changesDiffPanes,
      mergeDiffPanes: this.mergeDiffPanes,
      mergeLayout: this.mergeLayout,
      logAllRefs: this.logAllRefs,
      autoFetch: this.autoFetch,
      autoFetchIntervalMinutes: this.autoFetchIntervalMinutes,
      updateMethod: this.updateMethod,
      commitSignOff: this.commitSignOff,
      commitGpgSign: this.commitGpgSign,
      commitMessageHistory: this.commitMessageHistory,
      commitSubjectGuide: this.commitSubjectGuide,
      commitBoxLayout: this.commitBoxLayout,
      commitTemplates: this.commitTemplates,
      gitConsole: this.gitConsole,
      terminalShell: this.terminalShell,
      terminalFontFamily: this.terminalFontFamily,
      terminalFontSize: this.terminalFontSize,
      terminalLineHeight: this.terminalLineHeight,
      terminalLetterSpacing: this.terminalLetterSpacing,
      terminalFontWeight: this.terminalFontWeight,
      terminalFontWeightBold: this.terminalFontWeightBold,
      terminalLigatures: this.terminalLigatures,
      terminalNerdFontIcons: this.terminalNerdFontIcons,
      terminalCursorStyle: this.terminalCursorStyle,
      terminalCursorBlink: this.terminalCursorBlink,
      terminalScrollback: this.terminalScrollback,
      terminalCopyOnSelect: this.terminalCopyOnSelect,
      terminalFind: this.terminalFind,
      terminalFileLinks: this.terminalFileLinks,
      terminalGpuAcceleration: this.terminalGpuAcceleration,
      terminalUnicode11: this.terminalUnicode11,
      terminalOptionAsMeta: this.terminalOptionAsMeta,
      terminalVisualBell: this.terminalVisualBell,
      terminalSmoothScrolling: this.terminalSmoothScrolling,
      terminalDropPaths: this.terminalDropPaths,
      markdownViewMode: this.markdownViewMode,
      confirmDragAndDrop: this.confirmDragAndDrop,
      mcpEnabled: this.mcpEnabled,
      cliEnabled: this.cliEnabled,
      memoryLogEnabled: this.memoryLogEnabled,
      memoryLogIntervalMs: this.memoryLogIntervalMs,
      memoryLogThresholdMb: this.memoryLogThresholdMb,
      localHistoryEnabled: this.localHistoryEnabled,
      localHistoryDays: this.localHistoryDays,
      localHistorySizeMb: this.localHistorySizeMb,
      notificationsDoNotDisturb: this.notificationsDoNotDisturb,
      mcpPort: this.mcpPort,
      mcpTools: this.mcpTools,
      keybindings: this.keybindings,
      aiPermissionMode: this.aiPermissionMode,
      aiAgentArgs: this.aiAgentArgs,
      aiDefaultAgent: this.aiDefaultAgent,
      aiWorktreeLinks: this.aiWorktreeLinks,
      aiUsagePosition: this.aiUsagePosition,
      aiUsageHidden: this.aiUsageHidden,
      computerAwakeMode: this.computerAwakeMode,
      aiAgentCommands: this.aiAgentCommands,
    };
  }

  /** Preference keys whose value differs from the default, in display order. */
  changedPreferences(): (keyof Preferences)[] {
    return changedPreferenceKeys(this.preferences());
  }

  private uiState(): UiState {
    return {
      recentRepos: this.recentRepos,
      recentWorkspaces: this.recentWorkspaces,
      lastSession: this.lastSession,
      lastSessionFile: this.lastSessionFile,
      sessionRecorded: this.sessionRecorded,
      recentWorkspaceFiles: this.recentWorkspaceFiles,
      lastRunVersion: this.lastRunVersion,
      skippedVersion: this.skippedVersion,
      activeRepos: this.activeRepos,
      activeRepoAuto: this.activeRepoAuto,
      scriptNodeVersions: this.scriptNodeVersions,
      explorerOpen: this.explorerOpen,
      rightPanel: this.rightPanel,
      leftBarVisible: this.leftBarVisible,
      rightBarVisible: this.rightBarVisible,
      diffSplitRatio: this.diffSplitRatio,
      threePaneSplit: this.threePaneSplit,
      mergeStackHeight: this.mergeStackHeight,
      mergeStackRatio: this.mergeStackRatio,
      leftPanel: this.leftPanel,
      sidebarWidth: this.sidebarWidth,
      explorerWidth: this.explorerWidth,
      commitInfoHeight: this.commitInfoHeight,
      terminalHeight: this.terminalHeight,
      terminalListWidth: this.terminalListWidth,
      changesListWidth: this.changesListWidth,
      changesListVisible: this.changesListVisible,
      markdownPreviewRatio: this.markdownPreviewRatio,
      recentCommands: this.recentCommands,
      commitMessages: this.commitMessages,
      openTabs: this.openTabs,
      recentFileLists: this.recentFileLists,
    };
  }

  /** Schedules a write of both files; rapid changes coalesce into one write. */
  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  /** A file's whole content as this window holds it now. */
  private fileJson(configName: ConfigName): JsonObject {
    const value =
      configName === "state"
        ? stateToJson(this.uiState(), this.extraState)
        : { ...this.extraPreferences, ...this.preferences() };
    return cloneJson(value) as JsonObject;
  }

  /** Writes both files now, for Clear Cache, which restarts the page right after. */
  flushNow(): Promise<void> {
    return this.flush();
  }

  private flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    const writes = writableConfigs(this.loadErrors).map((configName) => this.writeChanges(configName));
    return Promise.all(writes)
      .then(() => {
        this.saveFailed = false;
      })
      .catch((error) => {
        if (!this.saveFailed) {
          this.saveFailed = true;
          toast.error("Could not save settings", errorMessage(error));
        }
      });
  }

  /** Sends what changed in one file since this window last wrote or heard of it. */
  private writeChanges(configName: ConfigName): Promise<void> {
    const next = this.fileJson(configName);
    const previous = this.synced[configName];
    const patch: ConfigPatch = diffJson(previous, next);
    if (isEmptyPatch(patch)) {
      return Promise.resolve();
    }
    this.synced[configName] = next;
    return api.updateConfig(configName, patch).catch((error) => {
      // Sent again with the next save.
      if (this.synced[configName] === next) {
        this.synced[configName] = previous;
      }
      throw error;
    });
  }

  /** Replaces a whole file, for a reset of one that could not be read (a patch never writes over it). */
  private writeWhole(configName: ConfigName): void {
    const next = this.fileJson(configName);
    this.synced[configName] = next;
    api.saveConfig(configName, next).catch((error) => toast.error("Could not save settings", errorMessage(error)));
  }

  /** Settings changed in another window apply here too, on top of changes this window has not written yet. */
  private listenToOtherWindows(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    onConfigChanged((event) => this.applyIncoming(event.configName, parsePatch(event.patch))).catch(() => {
      this.listening = false;
    });
  }

  private applyIncoming(configName: ConfigName, patch: ConfigPatch): void {
    if ((configName !== "settings" && configName !== "state") || this.loadErrors[configName] !== null) {
      return;
    }
    const incoming = configName === "state" ? withoutKeys(patch, WINDOW_STATE_KEYS) : patch;
    if (isEmptyPatch(incoming)) {
      return;
    }
    const { base, local } = rebaseIncoming(this.synced[configName], this.fileJson(configName), incoming);
    this.synced[configName] = base;
    if (configName === "settings") {
      this.applyPreferences(local);
      this.applyAppearance();
    } else {
      this.applyState(local);
    }
  }

  /** Opens the Settings dialog on `section`. */
  openDialog(section: SettingsSection = "appearance"): void {
    this.dialogSection = section;
    this.dialogOpen = true;
  }

  /** Updates one preference and applies it right away. */
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    (this as unknown as Preferences)[key] = value;
    this.applyAppearance();
    this.save();
  }

  /** Settings > Keyboard Shortcuts: the menu, the window, the editors and the terminals follow. */
  setKeybindings(overrides: ShortcutOverrides): void {
    this.setPreference("keybindings", overrides);
  }

  /** View > Word Wrap and Option+Z; open file editors follow at once. */
  toggleWordWrap(): void {
    this.setPreference("wordWrap", !this.wordWrap);
  }

  resetPreferences(): void {
    const unreadable = this.loadError !== null;
    this.applyPreferences({});
    this.loadError = null;
    this.applyAppearance();
    if (unreadable) {
      this.writeWhole("settings");
    } else {
      this.save();
    }
  }

  /** Reads settings.json again, e.g. after the user fixed it by hand. */
  async reload(): Promise<void> {
    this.loadError = null;
    try {
      this.applyPreferences(await api.loadConfig("settings"));
      this.synced.settings = this.fileJson("settings");
      this.applyAppearance();
    } catch (error) {
      this.loadError = errorMessage(error);
    }
  }

  /** Reads state.json again after the user fixed it by hand. */
  async reloadState(): Promise<void> {
    try {
      this.applyState(await api.loadConfig("state"));
      this.synced.state = this.fileJson("state");
      this.stateLoadError = null;
    } catch (error) {
      this.stateLoadError = errorMessage(error);
    }
  }

  /** Replaces a state.json that could not be read with what this session knows. */
  resetState(): void {
    this.stateLoadError = null;
    this.extraState = {};
    this.writeWhole("state");
  }

  /** The Node version a package.json's scripts run with; null goes back to Auto. */
  setScriptNodeVersion(filePath: string, choice: string | null): void {
    const { [filePath]: _previous, ...rest } = this.scriptNodeVersions;
    const next = choice === null ? rest : { ...rest, [filePath]: choice };
    this.scriptNodeVersions = Object.fromEntries(Object.entries(next).slice(-MAX_SCRIPT_NODE_VERSIONS));
    this.save();
  }

  /** Keeps `message` in the commit box history of `repoRoot` (only while the history is on). */
  rememberCommitMessage(repoRoot: string, message: string, time: number = Date.now()): void {
    if (!this.commitMessageHistory) {
      return;
    }
    const next = rememberInHistory(this.commitMessages, repoRoot, message, time);
    if (next !== this.commitMessages) {
      this.commitMessages = next;
      this.save();
    }
  }

  /** Settings > Git > Clear: forgets every remembered commit message. */
  clearCommitMessages(): void {
    this.commitMessages = {};
    this.save();
  }

  rememberActiveRepo(workspaceRoot: string, repoRoot: string): void {
    this.activeRepos = { ...this.activeRepos, [workspaceRoot]: repoRoot };
    this.save();
  }

  /** Keeps the file tabs of a workspace for its next open; null forgets them. */
  rememberTabs(workspaceId: string, session: SavedTabSession | null): void {
    this.openTabs = withTabSession(this.openTabs, workspaceId, session);
    this.save();
  }

  /** Keeps a workspace's Recent Files for its next open; an empty list forgets them. */
  rememberRecentFiles(workspaceId: string, files: readonly RecentFile[]): void {
    this.recentFileLists = withRecentFiles(this.recentFileLists, workspaceId, files);
    this.save();
  }

  setActiveRepoAuto(auto: boolean): void {
    this.activeRepoAuto = auto;
    this.save();
  }

  setLeftPanel(panel: LeftPanel): void {
    this.leftPanel = panel;
    this.save();
  }

  /** Activity bar click: show the panel, or hide the sidebar when it is already shown. */
  toggleLeftPanel(panel: Exclude<LeftPanel, null>): void {
    this.setLeftPanel(this.leftPanel === panel ? null : panel);
  }

  /** Share of the editor area the Markdown preview takes, clamped; saved with state.json. */
  setMarkdownPreviewRatio(ratio: number, persist: boolean): void {
    const [min, max] = MARKDOWN_PREVIEW_RATIO_RANGE;
    this.markdownPreviewRatio = Number.isFinite(ratio)
      ? Math.min(max, Math.max(min, ratio))
      : this.markdownPreviewRatio;
    if (persist) {
      this.save();
    }
  }

  /** Shows or hides the Changes tab's file list. */
  toggleChangesList(): void {
    this.changesListVisible = !this.changesListVisible;
    this.save();
  }

  toggleExplorer(): void {
    this.toggleRightPanel("files");
  }

  /** The right sidebar shows one panel: its icon hides the sidebar when that panel is shown, else shows it. */
  toggleRightPanel(panel: RightPanel): void {
    if (this.explorerOpen && this.rightPanel === panel) {
      this.explorerOpen = false;
    } else {
      this.rightPanel = panel;
      this.explorerOpen = true;
    }
    this.save();
  }

  /** The right sidebar is open on the Files panel. */
  get filesPanelShown(): boolean {
    return this.explorerOpen && this.rightPanel === "files";
  }

  /** The right sidebar is open on the AI panel. */
  get aiPanelShown(): boolean {
    return this.explorerOpen && this.rightPanel === "ai";
  }

  /** The right sidebar is open on the Notifications panel. */
  get notificationsPanelShown(): boolean {
    return this.explorerOpen && this.rightPanel === "notifications";
  }

  /** Shows `panel` in the right sidebar, opening it. */
  showRightPanel(panel: RightPanel): void {
    this.rightPanel = panel;
    this.explorerOpen = true;
    this.save();
  }

  /** Shows or hides the icon strip at the left or right edge of the window. */
  toggleActivityBar(side: "left" | "right"): void {
    if (side === "left") {
      this.leftBarVisible = !this.leftBarVisible;
    } else {
      this.rightBarVisible = !this.rightBarVisible;
    }
    this.save();
  }

  addRecent(repoPath: string): void {
    this.recentRepos = [repoPath, ...this.recentRepos.filter((path) => path !== repoPath)].slice(0, MAX_RECENT);
    this.save();
  }

  /**
   * Remembers the open folders: reopened on start, and listed as a recent
   * workspace when there are several. An empty list (Close Folder) makes the
   * next start show the welcome screen.
   */
  rememberSession(folderRoots: string[], workspaceFile: string | null = null): void {
    this.lastSession = folderRoots;
    this.lastSessionFile = workspaceFile;
    this.sessionRecorded = true;
    if (workspaceFile) {
      this.recentWorkspaceFiles = [
        workspaceFile,
        ...this.recentWorkspaceFiles.filter((file) => file !== workspaceFile),
      ].slice(0, MAX_RECENT);
    } else if (folderRoots.length > 1) {
      const key = folderRoots.join("\n");
      this.recentWorkspaces = [
        folderRoots,
        ...this.recentWorkspaces.filter((folders) => folders.join("\n") !== key),
      ].slice(0, MAX_RECENT);
    }
    this.save();
  }

  removeRecentWorkspaceFile(workspaceFile: string): void {
    this.recentWorkspaceFiles = this.recentWorkspaceFiles.filter((file) => file !== workspaceFile);
    this.save();
  }

  removeRecentWorkspace(folderRoots: string[]): void {
    const key = folderRoots.join("\n");
    this.recentWorkspaces = this.recentWorkspaces.filter((folders) => folders.join("\n") !== key);
    this.save();
  }

  removeRecent(repoPath: string): void {
    this.recentRepos = this.recentRepos.filter((path) => path !== repoPath);
    this.save();
  }

  /** File > Open Recent > Clear Recent: forgets every recent folder, workspace and workspace file. */
  clearRecent(): void {
    this.recentRepos = [];
    this.recentWorkspaces = [];
    this.recentWorkspaceFiles = [];
    this.save();
  }

  /** The Command Palette ran a command: it moves to the top of Recently Used. */
  rememberCommand(commandId: string): void {
    const next = pushRecentCommand(this.recentCommands, commandId);
    if (next.join("\n") !== this.recentCommands.join("\n")) {
      this.recentCommands = next;
      this.save();
    }
  }

  clearRecentCommands(): void {
    if (this.recentCommands.length > 0) {
      this.recentCommands = [];
      this.save();
    }
  }

  setTheme(theme: ThemeSetting): void {
    this.setPreference("theme", theme);
  }

  /** Picks the color theme used in light or dark mode; it applies at once when that mode is in use. */
  setColorTheme(mode: ColorMode, themeId: string): void {
    this.setPreference(mode === "dark" ? "darkColorTheme" : "lightColorTheme", pickThemeId(themeId, mode));
  }

  /** Light or dark, after following macOS for "system". */
  get colorMode(): ColorMode {
    return effectiveMode(this.theme, this.systemDark);
  }

  applyTheme(): void {
    this.applyAppearance();
  }

  private watchSystemAppearance(): void {
    if (this.systemMedia) {
      return;
    }
    this.systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
    this.systemDark = this.systemMedia.matches;
    this.systemMedia.addEventListener("change", (event) => {
      this.systemDark = event.matches;
      this.applyAppearance();
    });
  }

  /** Pushes theme and font sizes into the document. */
  applyAppearance(): void {
    const root = document.documentElement;
    this.watchSystemAppearance();
    // data-theme is always set, also when following macOS, so code that branches on light or
    // dark reads one attribute; the color theme's variables go in before the attributes change.
    const mode = this.colorMode;
    void applyColorTheme(mode, mode === "dark" ? this.darkColorTheme : this.lightColorTheme);
    root.style.setProperty("--ui-size", `${this.uiFontSize}px`);
    root.style.setProperty("--code-size", `${this.editorFontSize}px`);
    root.style.setProperty("--code-line-height", String(this.editorLineHeight));
    root.style.setProperty("--font-mono", this.editorFontFamily);
    // The UI library's monospace text (hashes, paths, search results) uses the same font as the editor.
    root.style.setProperty("--font-family-mono", this.editorFontFamily);
    root.style.setProperty("--code-weight", String(this.editorFontWeight));
    root.setAttribute("data-ligatures", this.fontLigatures ? "on" : "off");
    root.toggleAttribute("data-rounded-panels", this.roundedPanels);
  }
}

export const settings = new SettingsStore();
