// Pure parts of the settings store: validating what ~/.nibtree/settings.json
// and state.json hold, turning it back into JSON, deciding which files may be
// written and which session to restore on start. Kept free of Svelte and Tauri
// so it can be tested directly.

import { readThreeSplit, type ThreeSplit } from "@nibtree/ui/logic/threeSplit";
import type { AgentOverride } from "$lib/ai/agentConfig";
import { pickRecentCommands } from "../commands/recentCommands";
import { AUTO_SAVE_DELAY_RANGE, DEFAULT_AUTO_SAVE_DELAY } from "../editor/autoSave";
import { AUTO_FETCH_INTERVAL_RANGE, DEFAULT_AUTO_FETCH_MINUTES } from "./autoFetchPlan";
import { NO_TAB_LIMIT, pickTabLimit } from "./tabLimit";
import { pickUnloadTabMinutes } from "./tabSleep";
import { parseRecentFiles, type RecentFile } from "./recentFiles";
import { parseTabSessions, type SavedTabSession } from "./tabSession";
import type { ShortcutOverrides } from "../commands/registry";
import { pickKeybindings } from "../commands/shortcutSettings";
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, pickThemeId } from "@nibtree/ui/themes/themeIndex";
import { type MessageHistory, parseMessageHistory } from "../views/changes/commitMessages";
import { type CommitTemplate, parseCommitTemplates } from "../views/changes/commitTemplates";

export type ThemeSetting = "system" | "light" | "dark";

/** Which panel the left sidebar shows; null hides it. */
export type LeftPanel = "changes" | "branches" | "scripts" | null;

/** What the right sidebar shows while it is open: the file tree or the AI agents. */
export type RightPanel = "files" | "ai" | "notifications";

/** How a diff shows its two versions: in two columns, or in one with removed lines above added ones. */
export type DiffLayout = "sideBySide" | "inline";
export const DIFF_LAYOUT_CHOICES: { value: DiffLayout; label: string }[] = [
  { value: "sideBySide", label: "Side by side" },
  { value: "inline", label: "Inline" },
];
const DIFF_LAYOUTS = DIFF_LAYOUT_CHOICES.map((choice) => choice.value);

/** How many panes a side by side diff uses where a third version exists (the index, or a merge's second parent). */
export type DiffPanes = "two" | "three";
export const DIFF_PANES_CHOICES: { value: DiffPanes; label: string }[] = [
  { value: "two", label: "2 columns" },
  { value: "three", label: "3 columns" },
];
const DIFF_PANES = DIFF_PANES_CHOICES.map((choice) => choice.value);

/** The merge tool's layout: the three panes side by side, or the two sides on top and the result below. */
export type MergeLayout = "columns" | "stacked";
export const MERGE_LAYOUT_CHOICES: { value: MergeLayout; label: string }[] = [
  { value: "columns", label: "Columns" },
  { value: "stacked", label: "Stacked" },
];
const MERGE_LAYOUTS = MERGE_LAYOUT_CHOICES.map((choice) => choice.value);

/** Where the Changes view puts its commit box: one at the bottom, or one per repository. */
export type CommitBoxLayout = "single" | "perRepo";
export const COMMIT_BOX_LAYOUT_CHOICES: { value: CommitBoxLayout; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "perRepo", label: "Per repository" },
];
const COMMIT_BOX_LAYOUTS = COMMIT_BOX_LAYOUT_CHOICES.map((choice) => choice.value);

export type UpdateChannelSetting = "auto" | "stable" | "beta";

/** How Git > Update Project pulls each repository. */
export type UpdateMethod = "merge" | "rebase";

export const UPDATE_METHODS = ["merge", "rebase"] as const;

/** Commit Options' GPG signing: commit.gpgSign decides, -S, or --no-gpg-sign. */
export type CommitGpgSign = "default" | "sign" | "noSign";

export const COMMIT_GPG_SIGNS = ["default", "sign", "noSign"] as const;

/** File type icons in the file lists: none, simple shapes, or Material Icon Theme's colored icons. */
export type FileIconMode = "off" | "minimal" | "material";

export const FILE_ICON_CHOICES: { value: FileIconMode; label: string; hint: string }[] = [
  { value: "off", label: "No icons", hint: "One plain icon for every file. Uses no extra memory." },
  { value: "minimal", label: "Minimal", hint: "Simple colored shapes for common file types." },
  {
    value: "material",
    label: "Material Icons",
    hint: "Colored icons for over 1,000 file types, from Material Icon Theme.",
  },
];

const FILE_ICON_MODES = FILE_ICON_CHOICES.map((choice) => choice.value);

/** Where a file tab's toolbar (path, badges and buttons) shows: above the code, under it, or hidden. */
export type FileToolbarPlacement = "top" | "bottom" | "none";

export const FILE_TOOLBAR_CHOICES: { value: FileToolbarPlacement; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "none", label: "Hidden" },
];

const FILE_TOOLBAR_PLACEMENTS = FILE_TOOLBAR_CHOICES.map((choice) => choice.value);

/** A switch per part of the file toolbar, each on by default. */
export type FileToolbarSwitchKey =
  | "fileToolbarBreadcrumbs"
  | "fileToolbarBadges"
  | "fileToolbarChanges"
  | "fileToolbarBlame"
  | "fileToolbarCopyPath"
  | "fileToolbarMarkdownView"
  | "fileToolbarMarkdownFormat";

export const FILE_TOOLBAR_SWITCHES: { key: FileToolbarSwitchKey; label: string; hint: string }[] = [
  {
    key: "fileToolbarBreadcrumbs",
    label: "Breadcrumbs",
    hint: "The folders and file as a Navigation Bar. Off, Jump to Navigation Bar shows it over the editor.",
  },
  { key: "fileToolbarBadges", label: "Badges", hint: "Unsaved, Modified, New file and the number of conflicts." },
  {
    key: "fileToolbarChanges",
    label: "Change arrows",
    hint: "Previous and next change with the counter. F7 and Shift+F7 work either way.",
  },
  {
    key: "fileToolbarBlame",
    label: "Blame",
    hint: "The button that shows who changed each line. Also Git > Current File > Annotate with Git Blame.",
  },
  {
    key: "fileToolbarCopyPath",
    label: "Copy relative path",
    hint: "Copies the file's path inside the workspace folder.",
  },
  {
    key: "fileToolbarMarkdownView",
    label: "Markdown view switch",
    hint: "Editor, Editor and Preview, Rich Editor. Also in View > Markdown.",
  },
  {
    key: "fileToolbarMarkdownFormat",
    label: "Markdown formatting row",
    hint: "Bold, headings, lists and more above a Markdown file. It has its own row, so it shows even when the toolbar is hidden.",
  },
];

/** Which spaces and tabs the editors draw as dots and arrows. */
export type RenderWhitespace = "none" | "boundary" | "selection" | "trailing" | "all";

export const RENDER_WHITESPACE_CHOICES: { value: RenderWhitespace; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "Spaces and tabs are not drawn." },
  { value: "boundary", label: "Boundary", hint: "Draw all spaces and tabs except single spaces between words." },
  { value: "selection", label: "Selection", hint: "Draw spaces and tabs only inside selected text." },
  { value: "trailing", label: "Trailing", hint: "Draw only the spaces and tabs at the end of lines." },
  { value: "all", label: "All", hint: "Draw every space and tab." },
];

const RENDER_WHITESPACE_VALUES = RENDER_WHITESPACE_CHOICES.map((choice) => choice.value);

/** How the editors draw the cursor. */
export type EditorCursorStyle = "line" | "line-thin" | "block" | "block-outline" | "underline" | "underline-thin";

export const EDITOR_CURSOR_STYLE_CHOICES: { value: EditorCursorStyle; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "line-thin", label: "Line thin" },
  { value: "block", label: "Block" },
  { value: "block-outline", label: "Block outline" },
  { value: "underline", label: "Underline" },
  { value: "underline-thin", label: "Underline thin" },
];

const EDITOR_CURSOR_STYLES = EDITOR_CURSOR_STYLE_CHOICES.map((choice) => choice.value);

/** How the editor cursor blinks. */
export type EditorCursorBlinking = "blink" | "smooth" | "phase" | "expand" | "solid";

export const EDITOR_CURSOR_BLINKING_CHOICES: { value: EditorCursorBlinking; label: string; hint: string }[] = [
  { value: "blink", label: "Blink", hint: "On and off." },
  { value: "smooth", label: "Smooth", hint: "Fades out and in." },
  { value: "phase", label: "Phase", hint: "Fades slowly, staying visible longer." },
  { value: "expand", label: "Expand", hint: "Shrinks to its middle and grows back." },
  { value: "solid", label: "Solid", hint: "Never blinks." },
];

const EDITOR_CURSOR_BLINKINGS = EDITOR_CURSOR_BLINKING_CHOICES.map((choice) => choice.value);

export type ConfigName = "settings" | "state";

/** When the file editor saves by itself. */
export type AutoSaveMode = "off" | "afterDelay" | "onFocusChange";

export const AUTO_SAVE_MODES = ["off", "afterDelay", "onFocusChange"] as const;

/** Weight of terminal text; mapped to xterm's fontWeight values in terminal/fonts.ts. */
export type TerminalFontWeight = "normal" | "medium" | "bold";

export type TerminalCursorStyle = "block" | "bar" | "underline";

/** How a Markdown file opens: source only, source beside its preview, or the rich editor (the page, editable). */
export type MarkdownViewMode = "editor" | "split" | "preview";

export const MARKDOWN_VIEW_MODES = ["editor", "split", "preview"] as const;
/** Share of the editor area the Markdown preview takes in split mode. */
export const DEFAULT_MARKDOWN_PREVIEW_RATIO = 0.5;
export const MARKDOWN_PREVIEW_RATIO_RANGE = [0.15, 0.85] as const;

/** Sections of the Settings dialog, in the order the dialog lists them. */
export const SETTINGS_SECTIONS = [
  "appearance",
  "editor",
  "merge",
  "layout",
  "terminal",
  "ai",
  "keyboard",
  "github",
  "automation",
  "updates",
  "files",
  "about",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** The MCP server's default port on 127.0.0.1; any free port in the range works. */
export const DEFAULT_MCP_PORT = 48731;
export const MCP_PORT_RANGE = [1024, 65535] as const;
/** Tool switches kept in settings.json; far more than the app has tools. */
export const MAX_MCP_TOOL_STATES = 300;

export const TERMINAL_FONT_WEIGHTS = ["normal", "medium", "bold"] as const;
export const TERMINAL_CURSOR_STYLES = ["block", "bar", "underline"] as const;
export const TERMINAL_LINE_HEIGHT_RANGE = [1, 2] as const;
export const TERMINAL_LETTER_SPACING_RANGE = [0, 5] as const;
export const TERMINAL_SCROLLBACK_RANGE = [1000, 100000] as const;

export const DEFAULT_PANEL_WIDTH = 260;
/** The commit details' default height, the UI library's bottom panel default (double-click goes back to it). */
export const DEFAULT_COMMIT_INFO_HEIGHT = 260;
/** Height of the terminal panel below the editor. */
export const DEFAULT_TERMINAL_HEIGHT = 260;
export const MIN_TERMINAL_HEIGHT = 80;
/** Width of the list of terminals beside the panel, shown with two or more terminals. */
export const DEFAULT_TERMINAL_LIST_WIDTH = 180;
export const MIN_TERMINAL_LIST_WIDTH = 120;
/** Width of the file list in the Changes tab. */
export const DEFAULT_CHANGES_LIST_WIDTH = 320;
export const MIN_CHANGES_LIST_WIDTH = 160;
export const MAX_RECENT = 12;

/** JetBrains Mono when it is installed, else VS Code's default editor font on macOS, else Windows' own code fonts. */
export const DEFAULT_EDITOR_FONT =
  "'JetBrains Mono', Menlo, Monaco, 'Cascadia Mono', Consolas, 'Courier New', monospace";
/** Earlier defaults, read as today's so a saved copy of one does not count as a custom font. */
const OLD_DEFAULT_EDITOR_FONTS = ["'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace"];

export const MONOSPACE_FONTS = [
  "Menlo",
  "Monaco",
  "SF Mono",
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Source Code Pro",
  "IBM Plex Mono",
  "Hack",
  "Ubuntu Mono",
  "Courier New",
];

/**
 * Cleans a user-typed font list: drops characters that could escape the CSS
 * value, drops repeated families and makes sure a generic monospace fallback comes last.
 */
export function normalizeFontFamily(value: string): string {
  const cleaned = value
    .replace(/[;{}<>\\]/g, "")
    .trim()
    .slice(0, 200);
  if (!cleaned) {
    return DEFAULT_EDITOR_FONT;
  }
  const seen = new Set<string>();
  const families = cleaned
    .split(",")
    .map((family) => family.trim())
    .filter((family) => {
      // Picking a font adds it in front of the default list, which may name it already.
      const key = family.replace(/["']/g, "").toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  if (!families.some((family) => family.toLowerCase() === "monospace")) {
    families.push("monospace");
  }
  return families.join(", ");
}

export interface Preferences {
  theme: ThemeSetting;
  /** Color theme id (the UI library's themes/themeIndex.ts) used while the appearance is light. */
  lightColorTheme: string;
  /** Color theme id used while the appearance is dark. */
  darkColorTheme: string;
  uiFontSize: number;
  /** File type icons in the Files panel, the Changes list and commit file lists. Off by default: an icon set loads only when chosen. */
  fileIcons: FileIconMode;
  /** Sidebars, editor groups and the bottom panel as rounded panels with space between them. Any color theme. */
  roundedPanels: boolean;
  /** A glow in the project's Welcome page color at the left of the window's top bar. */
  projectColorHeader: boolean;
  /** The file toolbar above the code, under it, or hidden (Cmd+Up then shows the Navigation Bar floating). */
  fileToolbar: FileToolbarPlacement;
  fileToolbarBreadcrumbs: boolean;
  fileToolbarBadges: boolean;
  fileToolbarChanges: boolean;
  fileToolbarBlame: boolean;
  fileToolbarCopyPath: boolean;
  fileToolbarMarkdownView: boolean;
  fileToolbarMarkdownFormat: boolean;
  editorFontSize: number;
  /** Line height of code, as a multiple of the font size. */
  editorLineHeight: number;
  /** CSS font-family list for code, e.g. "Menlo, Monaco, monospace". */
  editorFontFamily: string;
  /** CSS font-weight of code, 100 (Thin) to 900 (Black). */
  editorFontWeight: number;
  /** Render programming ligatures (=>, !=, ===) with fonts that provide them. */
  fontLigatures: boolean;
  /** Color code by its language; off, editors load no grammar and keep no syntax tree. */
  syntaxHighlighting: boolean;
  tabSize: number;
  /** Indent like the file already does (spaces or tabs, and how many). */
  detectIndentation: boolean;
  wordWrap: boolean;
  renderWhitespace: RenderWhitespace;
  editorCursorStyle: EditorCursorStyle;
  /** Width in pixels of the Line cursor. */
  editorCursorWidth: number;
  editorCursorBlinking: EditorCursorBlinking;
  /** Glide the cursor to its new place instead of jumping. */
  editorCursorSmoothCaret: boolean;
  /** Pixels the cursor reaches above the text. */
  editorCaretExtraTop: number;
  /** Pixels the cursor reaches below the text. */
  editorCaretExtraBottom: number;
  /** Type the closing bracket or quote with the opening one. */
  editorAutoCloseBrackets: boolean;
  /** Code completion from the words of the file and the language's own lists. */
  editorCompletion: boolean;
  /** The completion list opens while typing; off, only Ctrl+Space opens it. */
  editorCompletionOnTyping: boolean;
  /** Fold arrows beside the line numbers in the file editor. */
  editorFoldGutter: boolean;
  /** Faint vertical lines at each indent level. */
  editorIndentGuides: boolean;
  /** Highlight other uses of the word at the cursor. */
  editorHighlightWord: boolean;
  /** Scroll the last line up to the top of the file editor. */
  editorScrollPastEnd: boolean;
  /** Option+drag selects a rectangle (column selection). */
  editorColumnSelection: boolean;
  /** Keep the headers of the blocks around the top line pinned above the file editor. */
  editorStickyScroll: boolean;
  /** A small picture of the whole file beside the scrollbar of the file editor. */
  editorMinimap: boolean;
  /** Color each pair of brackets by how deep it is nested. */
  editorBracketPairColors: boolean;
  /** Highlight the bracket that matches the one at the cursor. */
  editorMatchBrackets: boolean;
  /** Column of the right margin line; 0 hides it. */
  editorRulerColumn: number;
  /** Open the tabs a folder or workspace had when it was last open. */
  reopenTabsOnStart: boolean;
  /** Recent Files (Cmd+E): keep a list of the files shown in the editor, per workspace. */
  recentFiles: boolean;
  /** Reopen every window that was open at quit, each with its folders (read by the backend at start too). */
  reopenWindows: boolean;
  /** File tabs kept open: 0 no limit, 1 single tab, else the number (see tabLimit.ts). */
  tabLimit: number;
  /** A file tab hidden for `unloadHiddenTabsMinutes`, without unsaved edits, gives its editor back. */
  unloadHiddenTabs: boolean;
  unloadHiddenTabsMinutes: number;
  /** Editor groups side by side or stacked (Window > Split Right / Split Down). */
  splitEditor: boolean;
  /** Tabs that do not fit wrap onto more rows instead of scrolling. */
  wrapTabs: boolean;
  /** A strip with one tab shows it as a centered name instead of a tab. */
  singleTabTitle: boolean;
  autoSave: AutoSaveMode;
  /** Pause after the last edit before an "afterDelay" auto save. */
  autoSaveDelayMs: number;
  /** Keep the text of Untitled tabs and unsaved edits across restarts (hot exit), without asking on close. */
  rememberUnsaved: boolean;
  /** On save: remove spaces and tabs at line ends. */
  trimTrailingWhitespace: boolean;
  /** On save: end the file with a newline (files.insertFinalNewline). */
  insertFinalNewline: boolean;
  /** On save: remove blank lines after the last one (files.trimFinalNewlines). */
  trimFinalNewlines: boolean;
  /** Author, date and commit at the end of the cursor line. */
  currentLineBlame: boolean;
  /** Blame column beside the line numbers. */
  blameGutter: boolean;
  /** Ctrl/Cmd + mouse wheel over an editor changes the editor font size. */
  mouseWheelZoom: boolean;
  /** Ask GitHub for new releases every few hours. */
  checkForUpdates: boolean;
  /** "auto" follows betas only when this build is a beta. */
  updateChannel: UpdateChannelSetting;
  ignoreWhitespace: boolean;
  /** Every diff side by side or inline; Settings > Git and the diff toolbar both set it. */
  diffLayout: DiffLayout;
  /** The Changes diff: HEAD and the work tree, or HEAD, the index and the work tree. */
  changesDiffPanes: DiffPanes;
  /** A merge commit's file changed on both sides: one parent against the result, or both parents around it. */
  mergeDiffPanes: DiffPanes;
  mergeLayout: MergeLayout;
  logAllRefs: boolean;
  /** Fetch every remote in the background while the window is in use. */
  autoFetch: boolean;
  /** Minutes between background fetches of a repository. */
  autoFetchIntervalMinutes: number;
  /** Git > Update Project: merge or rebase the incoming changes, remembered from its dialog. */
  updateMethod: UpdateMethod;
  /** Commit Options: add a Signed-off-by trailer (--signoff) to every commit. */
  commitSignOff: boolean;
  /** Commit Options: GPG signing of every commit. */
  commitGpgSign: CommitGpgSign;
  /** The commit box lists recent messages (Cmd+E) and remembers messages that were not committed. */
  commitMessageHistory: boolean;
  /** Soft warning under the commit box when the subject line passes 72 characters. */
  commitSubjectGuide: boolean;
  /** One commit box under the Changes list, or one at the top of each repository; Settings > Git and the Changes title bar both set it. */
  commitBoxLayout: CommitBoxLayout;
  /** Commit message templates picked from the commit box, with {branch}, {ticket} and other placeholders. */
  commitTemplates: CommitTemplate[];
  /** Record the git commands the app runs (Git Console). Off, the console is not loaded at all. */
  gitConsole: boolean;
  /** Shell id (its absolute path) new terminals start; null is the login shell. */
  terminalShell: string | null;
  /** CSS font-family list for the terminal; empty uses the editor font. */
  terminalFontFamily: string;
  terminalFontSize: number;
  /** Multiplier of the font's line height, xterm's `lineHeight`. */
  terminalLineHeight: number;
  /** Extra whole pixels between characters, xterm's `letterSpacing`. */
  terminalLetterSpacing: number;
  terminalFontWeight: TerminalFontWeight;
  /** Weight of bold text (SGR 1). */
  terminalFontWeightBold: TerminalFontWeight;
  terminalLigatures: boolean;
  /** Nerd Font and Powerline symbol fonts are added to the terminal font list as fallbacks. */
  terminalNerdFontIcons: boolean;
  terminalCursorStyle: TerminalCursorStyle;
  terminalCursorBlink: boolean;
  /** Lines kept above the screen. */
  terminalScrollback: number;
  /** Selecting text copies it. */
  terminalCopyOnSelect: boolean;
  /** Find in the terminal (Cmd+F). Off, the search addon is never loaded. */
  terminalFind: boolean;
  /** Cmd+click opens file paths printed in the terminal, such as `src/app.ts:12:5`. */
  terminalFileLinks: boolean;
  /** Draw with WebGL (xterm's GPU renderer), falling back to the DOM renderer. */
  terminalGpuAcceleration: boolean;
  /** Unicode 11 character widths, so emoji and wide characters line up. */
  terminalUnicode11: boolean;
  /** macOS: Option works as Meta (xterm's macOptionIsMeta) for word jumps and emacs keys. */
  terminalOptionAsMeta: boolean;
  /** A short flash, or a dot on a hidden terminal, when the shell rings the bell. */
  terminalVisualBell: boolean;
  /** Animate scrolling (xterm's smoothScrollDuration). */
  terminalSmoothScrolling: boolean;
  /** Dropping files from Finder on a terminal types their quoted paths. */
  terminalDropPaths: boolean;
  /** How Markdown files open; each file then remembers its own mode for the session. */
  markdownViewMode: MarkdownViewMode;
  /** Files panel: ask before a drag and drop moves files or folders. */
  confirmDragAndDrop: boolean;
  /** The MCP server for AI tools. Off, nothing listens. */
  mcpEnabled: boolean;
  /** The `nibtree cli` command line tool; it talks to the same local server. */
  cliEnabled: boolean;
  /** Port of the local server on 127.0.0.1. */
  mcpPort: number;
  /** Tools switched away from their default (on, or off for destructive ones), by tool name. */
  mcpTools: Record<string, boolean>;
  /** Custom keyboard shortcuts: command id to a menu accelerator, or null for no key. */
  keybindings: ShortcutOverrides;
  /** Debug memory log: memory readings and UI events written to ~/.nibtree/logs/memory.log. */
  memoryLogEnabled: boolean;
  /** How often the memory log reads memory. */
  memoryLogIntervalMs: number;
  /** A reading is written when the total changed by at least this much. */
  memoryLogThresholdMb: number;
  /** Local History: a copy of a file on every save, outside change and discard (~/.nibtree/local-history). */
  localHistoryEnabled: boolean;
  /** Versions older than this many days are removed. */
  localHistoryDays: number;
  /** All versions together stay under this many MB; the oldest go first. */
  localHistorySizeMb: number;
  /** Only errors pop up; every message is still kept in the status bar's notification list. */
  notificationsDoNotDisturb: boolean;
  /** AI agents: ask before acting (normal), or full autonomy; "ask" asks on the first start. */
  aiPermissionMode: AiPermissionMode;
  /** Extra command line arguments of each AI agent, by agent id (see ai/agents.ts). */
  aiAgentArgs: Record<string, string>;
  /** The agent New Task picks first: the last one started; "" before any. */
  aiDefaultAgent: string;
  /** Folders of the main checkout linked into each new worktree, such as node_modules. */
  aiWorktreeLinks: string[];
  /** Where the status bar shows the AI agents' usage limits. */
  aiUsagePosition: AiUsagePosition;
  /** Keep computer awake (like Orca): Off, Agent (while an agent works) or On. */
  computerAwakeMode: ComputerAwakeMode;
  /** Usage providers the status bar leaves out (and never reads), such as "codex"; all are shown by default. */
  aiUsageHidden: AiUsageProvider[];
  /** Each agent's command, flags and prompt style as changed in Settings > AI (ai/agentConfig.ts), by agent id. */
  aiAgentCommands: Record<string, AgentOverride>;
}

export const AI_PERMISSION_MODES = ["ask", "normal", "full"] as const;
export const AI_USAGE_POSITIONS = ["left", "right", "hidden"] as const;
export const COMPUTER_AWAKE_MODES = ["on", "agent", "off"] as const;
export type ComputerAwakeMode = (typeof COMPUTER_AWAKE_MODES)[number];
/** The agents whose usage the status bar can show (ai_usage in Rust), in its order. */
export const AI_USAGE_PROVIDERS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
] as const;
export type AiUsageProvider = (typeof AI_USAGE_PROVIDERS)[number]["id"];
export type AiUsagePosition = (typeof AI_USAGE_POSITIONS)[number];
export type AiPermissionMode = (typeof AI_PERMISSION_MODES)[number];
const AI_AGENT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_AI_AGENT_ARGS = 1000;

/** The memory log reads every 100 ms to 10 s, and logs changes of 0 MB (every reading) to 500 MB. */
export const MEMORY_LOG_INTERVAL_RANGE = [100, 10_000] as const;
export const MEMORY_LOG_THRESHOLD_RANGE = [0, 500] as const;

/** Local History keeps 1 to 90 days and 10 MB to 2 GB (the backend clamps the same way). */
export const LOCAL_HISTORY_DAYS_RANGE = [1, 90] as const;
export const LOCAL_HISTORY_SIZE_MB_RANGE = [10, 2000] as const;

/** Right margin columns; 0 means no margin line. */
export const EDITOR_RULER_RANGE = [1, 500] as const;
/** The column the margin line starts at when it is switched on. */
export const DEFAULT_RULER_COLUMN = 120;

export const defaultPreferences: Preferences = {
  theme: "system",
  lightColorTheme: DEFAULT_LIGHT_THEME,
  darkColorTheme: DEFAULT_DARK_THEME,
  uiFontSize: 13,
  fileIcons: "off",
  roundedPanels: false,
  projectColorHeader: true,
  fileToolbar: "top",
  fileToolbarBreadcrumbs: true,
  fileToolbarBadges: true,
  fileToolbarChanges: true,
  fileToolbarBlame: true,
  fileToolbarCopyPath: true,
  fileToolbarMarkdownView: true,
  fileToolbarMarkdownFormat: true,
  editorFontSize: 13,
  editorLineHeight: 1.25,
  editorFontFamily: DEFAULT_EDITOR_FONT,
  editorFontWeight: 400,
  fontLigatures: false,
  syntaxHighlighting: true,
  tabSize: 4,
  detectIndentation: true,
  wordWrap: false,
  renderWhitespace: "selection",
  editorCursorStyle: "line",
  editorCursorWidth: 2,
  editorCursorBlinking: "blink",
  editorCursorSmoothCaret: false,
  editorCaretExtraTop: 0,
  editorCaretExtraBottom: 0,
  editorAutoCloseBrackets: true,
  editorCompletion: true,
  editorCompletionOnTyping: true,
  editorFoldGutter: true,
  editorIndentGuides: true,
  editorHighlightWord: true,
  editorScrollPastEnd: true,
  editorColumnSelection: true,
  editorStickyScroll: true,
  editorMinimap: false,
  editorBracketPairColors: true,
  editorMatchBrackets: true,
  editorRulerColumn: 0,
  reopenTabsOnStart: true,
  recentFiles: true,
  reopenWindows: true,
  tabLimit: NO_TAB_LIMIT,
  unloadHiddenTabs: true,
  unloadHiddenTabsMinutes: 15,
  splitEditor: true,
  wrapTabs: false,
  singleTabTitle: true,
  autoSave: "off",
  autoSaveDelayMs: DEFAULT_AUTO_SAVE_DELAY,
  rememberUnsaved: true,
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
  trimFinalNewlines: false,
  currentLineBlame: true,
  blameGutter: false,
  mouseWheelZoom: false,
  checkForUpdates: true,
  updateChannel: "auto",
  ignoreWhitespace: false,
  diffLayout: "sideBySide",
  changesDiffPanes: "two",
  mergeDiffPanes: "three",
  mergeLayout: "columns",
  logAllRefs: true,
  autoFetch: true,
  autoFetchIntervalMinutes: DEFAULT_AUTO_FETCH_MINUTES,
  updateMethod: "merge",
  commitSignOff: false,
  commitGpgSign: "default",
  commitMessageHistory: true,
  commitSubjectGuide: true,
  commitBoxLayout: "single",
  commitTemplates: [],
  gitConsole: false,
  terminalShell: null,
  terminalFontFamily: "",
  terminalFontSize: 13,
  terminalLineHeight: 1.2,
  terminalLetterSpacing: 0,
  terminalFontWeight: "normal",
  terminalFontWeightBold: "bold",
  terminalLigatures: false,
  terminalNerdFontIcons: true,
  terminalCursorStyle: "block",
  terminalCursorBlink: true,
  terminalScrollback: 5000,
  terminalCopyOnSelect: false,
  terminalFind: true,
  terminalFileLinks: true,
  terminalGpuAcceleration: true,
  terminalUnicode11: true,
  terminalOptionAsMeta: false,
  terminalVisualBell: true,
  terminalSmoothScrolling: false,
  terminalDropPaths: true,
  markdownViewMode: "split",
  confirmDragAndDrop: true,
  mcpEnabled: false,
  cliEnabled: false,
  mcpPort: DEFAULT_MCP_PORT,
  memoryLogEnabled: false,
  memoryLogIntervalMs: 500,
  memoryLogThresholdMb: 5,
  localHistoryEnabled: true,
  localHistoryDays: 7,
  localHistorySizeMb: 200,
  notificationsDoNotDisturb: false,
  mcpTools: {},
  keybindings: {},
  aiPermissionMode: "ask",
  aiAgentArgs: {},
  aiDefaultAgent: "",
  aiWorktreeLinks: ["node_modules"],
  aiUsagePosition: "right",
  aiUsageHidden: [],
  computerAwakeMode: "off",
  aiAgentCommands: {},
};

export const FONT_SIZE_RANGE = { ui: [11, 16], editor: [10, 20], terminal: [9, 24] } as const;
/** Line spacing of code in the editor, diffs and the merge tool. */
export const EDITOR_LINE_HEIGHT_RANGE = [1, 2.5] as const;
/** Code font weights in steps of 100, named like the styles of JetBrains Mono and most variable fonts. */
export const EDITOR_FONT_WEIGHT_RANGE = [100, 900] as const;
const FONT_WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

/** The style name of a font weight, such as "Light" for 300; other values read as their number. */
export function fontWeightName(fontWeight: number): string {
  return FONT_WEIGHT_NAMES[fontWeight] ?? String(fontWeight);
}
export const TAB_SIZES = [2, 4, 8] as const;
export const EDITOR_CURSOR_WIDTH_RANGE = [1, 6] as const;
export const CARET_EXTRA_RANGE = [0, 10] as const;

/** UI state kept in state.json. */
export interface UiState {
  recentRepos: string[];
  /** Recent multi-folder workspaces, each a list of folder roots. */
  recentWorkspaces: string[][];
  /** Folders open when the app last closed, reopened on start. */
  lastSession: string[];
  /** Workspace file open when the app last closed; takes priority over `lastSession`. */
  lastSessionFile: string | null;
  /**
   * state.json recorded a session, even an empty one. Only data written before
   * sessions existed lacks it; an empty recorded session means the user closed
   * the folder on purpose.
   */
  sessionRecorded: boolean;
  /** Recently used workspace files. */
  recentWorkspaceFiles: string[];
  /** Version that last ran, to show What's New once after an update. */
  lastRunVersion: string | null;
  /** A release the user chose to skip; it is not announced again. */
  skippedVersion: string | null;
  activeRepos: Record<string, string>;
  /** The active repository follows the open tab (the status bar picker's Auto). */
  activeRepoAuto: boolean;
  /** Scripts panel: the Node version each package.json runs with, by file path: a bin folder, or "default" for the shell's. */
  scriptNodeVersions: Record<string, string>;
  /** The right sidebar is open; `rightPanel` says what it shows. */
  explorerOpen: boolean;
  rightPanel: RightPanel;
  /** The icon strips at the left and right edges of the window (the activity bars). */
  leftBarVisible: boolean;
  rightBarVisible: boolean;
  /** The left side's share of a side-by-side diff (see src/lib/diff/split.ts). */
  diffSplitRatio: number;
  /** The panes' widths in a three-pane diff (see ui/web/src/lib/logic/threeSplit.ts). */
  threePaneSplit: ThreeSplit;
  /** The stacked merge's top row height in px (0: half the frame) and its two top panes' split. */
  mergeStackHeight: number;
  mergeStackRatio: number;
  leftPanel: LeftPanel;
  sidebarWidth: number;
  explorerWidth: number;
  /** Height of a commit's message and details above its changed files (History panel, commit tabs). */
  commitInfoHeight: number;
  /** Height of the terminal panel. */
  terminalHeight: number;
  /** Width of the terminal list beside the panel. */
  terminalListWidth: number;
  /** The Changes tab's file list: its width, and whether it is shown. */
  changesListWidth: number;
  changesListVisible: boolean;
  /** Share of the editor area the Markdown preview takes beside the source. */
  markdownPreviewRatio: number;
  /** Command Palette: recently used command ids, most recent first. */
  recentCommands: string[];
  /** Commit messages typed but not committed, and committed from the app, by repository root. */
  commitMessages: MessageHistory;
  /** The file tabs of each workspace, by workspace id, for Reopen tabs on start. */
  openTabs: Record<string, SavedTabSession>;
  /** Recent Files (Cmd+E) of each workspace, by workspace id. */
  recentFileLists: Record<string, RecentFile[]>;
}

export type Json = Record<string, unknown>;

export function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Rounds to the nearest step, so 1.5499999 is saved as 1.55. */
function roundTo(value: number, step: number): number {
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

function pickStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function pickString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function pickOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Like pickNumber, rounded to a whole number first. */
function pickInteger(value: unknown, fallback: number, min: number, max: number): number {
  return pickNumber(typeof value === "number" ? Math.round(value) : value, fallback, min, max);
}

/** Rounded to tenths so a hand-edited 1.234 matches what the slider can show. */
function pickTenths(value: unknown, fallback: number, min: number, max: number): number {
  return pickNumber(typeof value === "number" ? Math.round(value * 10) / 10 : value, fallback, min, max);
}

/** A margin column from Settings or settings.json: a whole column in range, or 0 (off) for anything else. */
export function pickRulerColumn(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.round(value) <= 0) {
    return 0;
  }
  return pickInteger(value, 0, ...EDITOR_RULER_RANGE);
}

/** A scrollback typed in Settings or found in settings.json: whole lines, clamped; anything else is the default. */
export function clampTerminalScrollback(value: unknown): number {
  return pickInteger(value, defaultPreferences.terminalScrollback, ...TERMINAL_SCROLLBACK_RANGE);
}

/** Empty (or only spaces) means "use the editor font"; anything else is cleaned like the editor font. */
export function normalizeTerminalFontFamily(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  return normalizeFontFamily(value);
}

/** A shell is an absolute path; anything else (or an empty string) means the login shell. */
function pickShell(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const shell = value.trim();
  return shell && shell.length <= 1024 && !shell.includes("\0") ? shell : null;
}

/** A port typed in Settings or found in settings.json: a whole number in range, else null. */
export function parseMcpPort(value: unknown): number | null {
  const port = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof port !== "number" || !Number.isInteger(port)) {
    return null;
  }
  return port >= MCP_PORT_RANGE[0] && port <= MCP_PORT_RANGE[1] ? port : null;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** Only tool names with a true or false are kept, at most MAX_MCP_TOOL_STATES of them. */
const PROMPT_STYLES = ["argument", "flag", "typed", "none"] as const;

function shortText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

/** Each agent's changed command, flags and prompt style; anything malformed is left out. */
export function pickAgentCommands(value: unknown): Record<string, AgentOverride> {
  const commands: Record<string, AgentOverride> = {};
  for (const [agentId, raw] of Object.entries(asObject(value))) {
    if (!AI_AGENT_ID.test(agentId)) {
      continue;
    }
    const data = asObject(raw);
    const entry: AgentOverride = {};
    const command = shortText(data.command, 500);
    if (command !== undefined && command.trim() !== "") {
      entry.command = command;
    }
    const autonomy = shortText(data.fullAutonomyArgs, 500);
    if (autonomy !== undefined) {
      entry.fullAutonomyArgs = autonomy;
    }
    const style = PROMPT_STYLES.find((candidate) => candidate === data.promptStyle);
    if (style) {
      entry.promptStyle = style;
    }
    const flag = shortText(data.promptFlag, 100);
    if (flag !== undefined && flag.trim() !== "") {
      entry.promptFlag = flag;
    }
    if (Object.keys(entry).length > 0) {
      commands[agentId] = entry;
    }
  }
  return commands;
}

/** Extra arguments by agent id; blank ones are dropped. */
export function pickAgentArgs(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asObject(value)).filter(
      (entry): entry is [string, string] =>
        AI_AGENT_ID.test(entry[0]) &&
        typeof entry[1] === "string" &&
        entry[1].trim() !== "" &&
        entry[1].length <= MAX_AI_AGENT_ARGS,
    ),
  );
}

export function pickToolStates(value: unknown): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(asObject(value))
      .filter((entry): entry is [string, boolean] => TOOL_NAME.test(entry[0]) && typeof entry[1] === "boolean")
      .slice(0, MAX_MCP_TOOL_STATES),
  );
}

/** Node version choices kept in state.json; the oldest go first. */
export const MAX_SCRIPT_NODE_VERSIONS = 200;

/** Keys of state.json we understand; others are kept as they are. */
const STATE_KEYS = [
  "recentWorkspaces",
  "lastSession",
  "lastSessionFile",
  "recentWorkspaceFiles",
  "lastRunVersion",
  "skippedVersion",
  "recentFolders",
  "recentRepos",
  "activeRepos",
  "activeRepoAuto",
  "scriptNodeVersions",
  "explorerOpen",
  "rightPanel",
  "leftBarVisible",
  "rightBarVisible",
  "diffSplitRatio",
  "threePaneSplit",
  "mergeStackHeight",
  "mergeStackRatio",
  "leftPanel",
  "sidebarWidth",
  "explorerWidth",
  "commitInfoHeight",
  "terminalHeight",
  "terminalListWidth",
  "changesListWidth",
  "changesListVisible",
  "markdownPreviewRatio",
  "recentCommands",
  "commitMessages",
  "openTabs",
  "recentFileLists",
];

/** Validates settings.json; unknown keys come back in `extra` so a save keeps them. */
export function parsePreferences(value: unknown): { preferences: Preferences; extra: Json } {
  const data = asObject(value);
  const theme = data.theme;
  const channel = data.updateChannel;
  const preferences: Preferences = {
    theme: theme === "light" || theme === "dark" || theme === "system" ? theme : defaultPreferences.theme,
    lightColorTheme: pickThemeId(data.lightColorTheme, "light"),
    darkColorTheme: pickThemeId(data.darkColorTheme, "dark"),
    uiFontSize: pickNumber(data.uiFontSize, defaultPreferences.uiFontSize, ...FONT_SIZE_RANGE.ui),
    fileIcons: pickOneOf(data.fileIcons, FILE_ICON_MODES, defaultPreferences.fileIcons),
    roundedPanels: pickBoolean(data.roundedPanels, defaultPreferences.roundedPanels),
    projectColorHeader: pickBoolean(data.projectColorHeader, defaultPreferences.projectColorHeader),
    fileToolbar: pickOneOf(data.fileToolbar, FILE_TOOLBAR_PLACEMENTS, defaultPreferences.fileToolbar),
    fileToolbarBreadcrumbs: pickBoolean(data.fileToolbarBreadcrumbs, defaultPreferences.fileToolbarBreadcrumbs),
    fileToolbarBadges: pickBoolean(data.fileToolbarBadges, defaultPreferences.fileToolbarBadges),
    fileToolbarChanges: pickBoolean(data.fileToolbarChanges, defaultPreferences.fileToolbarChanges),
    fileToolbarBlame: pickBoolean(data.fileToolbarBlame, defaultPreferences.fileToolbarBlame),
    fileToolbarCopyPath: pickBoolean(data.fileToolbarCopyPath, defaultPreferences.fileToolbarCopyPath),
    fileToolbarMarkdownView: pickBoolean(data.fileToolbarMarkdownView, defaultPreferences.fileToolbarMarkdownView),
    fileToolbarMarkdownFormat: pickBoolean(
      data.fileToolbarMarkdownFormat,
      defaultPreferences.fileToolbarMarkdownFormat,
    ),
    editorFontSize: pickNumber(data.editorFontSize, defaultPreferences.editorFontSize, ...FONT_SIZE_RANGE.editor),
    editorLineHeight: roundTo(
      pickNumber(data.editorLineHeight, defaultPreferences.editorLineHeight, ...EDITOR_LINE_HEIGHT_RANGE),
      0.05,
    ),
    editorFontFamily:
      typeof data.editorFontFamily === "string" && !OLD_DEFAULT_EDITOR_FONTS.includes(data.editorFontFamily)
        ? normalizeFontFamily(data.editorFontFamily)
        : DEFAULT_EDITOR_FONT,
    editorFontWeight: roundTo(
      pickNumber(data.editorFontWeight, defaultPreferences.editorFontWeight, ...EDITOR_FONT_WEIGHT_RANGE),
      100,
    ),
    fontLigatures: pickBoolean(data.fontLigatures, defaultPreferences.fontLigatures),
    syntaxHighlighting: pickBoolean(data.syntaxHighlighting, defaultPreferences.syntaxHighlighting),
    tabSize: (TAB_SIZES as readonly unknown[]).includes(data.tabSize)
      ? (data.tabSize as number)
      : defaultPreferences.tabSize,
    detectIndentation: pickBoolean(data.detectIndentation, defaultPreferences.detectIndentation),
    wordWrap: pickBoolean(data.wordWrap, defaultPreferences.wordWrap),
    renderWhitespace: pickOneOf(data.renderWhitespace, RENDER_WHITESPACE_VALUES, defaultPreferences.renderWhitespace),
    editorCursorStyle: pickOneOf(data.editorCursorStyle, EDITOR_CURSOR_STYLES, defaultPreferences.editorCursorStyle),
    editorCursorWidth: pickInteger(
      data.editorCursorWidth,
      defaultPreferences.editorCursorWidth,
      ...EDITOR_CURSOR_WIDTH_RANGE,
    ),
    editorCursorBlinking: pickOneOf(
      data.editorCursorBlinking,
      EDITOR_CURSOR_BLINKINGS,
      defaultPreferences.editorCursorBlinking,
    ),
    editorCursorSmoothCaret: pickBoolean(data.editorCursorSmoothCaret, defaultPreferences.editorCursorSmoothCaret),
    editorCaretExtraTop: pickInteger(
      data.editorCaretExtraTop,
      defaultPreferences.editorCaretExtraTop,
      ...CARET_EXTRA_RANGE,
    ),
    editorCaretExtraBottom: pickInteger(
      data.editorCaretExtraBottom,
      defaultPreferences.editorCaretExtraBottom,
      ...CARET_EXTRA_RANGE,
    ),
    editorAutoCloseBrackets: pickBoolean(data.editorAutoCloseBrackets, defaultPreferences.editorAutoCloseBrackets),
    editorCompletion: pickBoolean(data.editorCompletion, defaultPreferences.editorCompletion),
    editorCompletionOnTyping: pickBoolean(data.editorCompletionOnTyping, defaultPreferences.editorCompletionOnTyping),
    editorFoldGutter: pickBoolean(data.editorFoldGutter, defaultPreferences.editorFoldGutter),
    editorIndentGuides: pickBoolean(data.editorIndentGuides, defaultPreferences.editorIndentGuides),
    editorHighlightWord: pickBoolean(data.editorHighlightWord, defaultPreferences.editorHighlightWord),
    editorScrollPastEnd: pickBoolean(data.editorScrollPastEnd, defaultPreferences.editorScrollPastEnd),
    editorColumnSelection: pickBoolean(data.editorColumnSelection, defaultPreferences.editorColumnSelection),
    editorStickyScroll: pickBoolean(data.editorStickyScroll, defaultPreferences.editorStickyScroll),
    editorMinimap: pickBoolean(data.editorMinimap, defaultPreferences.editorMinimap),
    editorBracketPairColors: pickBoolean(data.editorBracketPairColors, defaultPreferences.editorBracketPairColors),
    editorMatchBrackets: pickBoolean(data.editorMatchBrackets, defaultPreferences.editorMatchBrackets),
    editorRulerColumn: pickRulerColumn(data.editorRulerColumn),
    reopenTabsOnStart: pickBoolean(data.reopenTabsOnStart, defaultPreferences.reopenTabsOnStart),
    recentFiles: pickBoolean(data.recentFiles, defaultPreferences.recentFiles),
    reopenWindows: pickBoolean(data.reopenWindows, defaultPreferences.reopenWindows),
    tabLimit: pickTabLimit(data.tabLimit),
    unloadHiddenTabs: pickBoolean(data.unloadHiddenTabs, defaultPreferences.unloadHiddenTabs),
    unloadHiddenTabsMinutes: pickUnloadTabMinutes(
      data.unloadHiddenTabsMinutes,
      defaultPreferences.unloadHiddenTabsMinutes,
    ),
    splitEditor: pickBoolean(data.splitEditor, defaultPreferences.splitEditor),
    wrapTabs: pickBoolean(data.wrapTabs, defaultPreferences.wrapTabs),
    singleTabTitle: pickBoolean(data.singleTabTitle, defaultPreferences.singleTabTitle),
    autoSave: pickOneOf(data.autoSave, AUTO_SAVE_MODES, defaultPreferences.autoSave),
    autoSaveDelayMs: pickInteger(data.autoSaveDelayMs, defaultPreferences.autoSaveDelayMs, ...AUTO_SAVE_DELAY_RANGE),
    rememberUnsaved: pickBoolean(data.rememberUnsaved, defaultPreferences.rememberUnsaved),
    trimTrailingWhitespace: pickBoolean(data.trimTrailingWhitespace, defaultPreferences.trimTrailingWhitespace),
    insertFinalNewline: pickBoolean(data.insertFinalNewline, defaultPreferences.insertFinalNewline),
    trimFinalNewlines: pickBoolean(data.trimFinalNewlines, defaultPreferences.trimFinalNewlines),
    currentLineBlame: pickBoolean(data.currentLineBlame, defaultPreferences.currentLineBlame),
    blameGutter: pickBoolean(data.blameGutter, defaultPreferences.blameGutter),
    mouseWheelZoom: pickBoolean(data.mouseWheelZoom, defaultPreferences.mouseWheelZoom),
    checkForUpdates: pickBoolean(data.checkForUpdates, defaultPreferences.checkForUpdates),
    updateChannel:
      channel === "stable" || channel === "beta" || channel === "auto" ? channel : defaultPreferences.updateChannel,
    ignoreWhitespace: pickBoolean(data.ignoreWhitespace, defaultPreferences.ignoreWhitespace),
    diffLayout: pickOneOf(data.diffLayout, DIFF_LAYOUTS, defaultPreferences.diffLayout),
    changesDiffPanes: pickOneOf(data.changesDiffPanes, DIFF_PANES, defaultPreferences.changesDiffPanes),
    mergeDiffPanes: pickOneOf(data.mergeDiffPanes, DIFF_PANES, defaultPreferences.mergeDiffPanes),
    mergeLayout: pickOneOf(data.mergeLayout, MERGE_LAYOUTS, defaultPreferences.mergeLayout),
    logAllRefs: pickBoolean(data.logAllRefs, defaultPreferences.logAllRefs),
    autoFetch: pickBoolean(data.autoFetch, defaultPreferences.autoFetch),
    autoFetchIntervalMinutes: pickInteger(
      data.autoFetchIntervalMinutes,
      defaultPreferences.autoFetchIntervalMinutes,
      ...AUTO_FETCH_INTERVAL_RANGE,
    ),
    updateMethod: pickOneOf(data.updateMethod, UPDATE_METHODS, defaultPreferences.updateMethod),
    commitSignOff: pickBoolean(data.commitSignOff, defaultPreferences.commitSignOff),
    commitGpgSign: pickOneOf(data.commitGpgSign, COMMIT_GPG_SIGNS, defaultPreferences.commitGpgSign),
    commitMessageHistory: pickBoolean(data.commitMessageHistory, defaultPreferences.commitMessageHistory),
    commitSubjectGuide: pickBoolean(data.commitSubjectGuide, defaultPreferences.commitSubjectGuide),
    commitBoxLayout: pickOneOf(data.commitBoxLayout, COMMIT_BOX_LAYOUTS, defaultPreferences.commitBoxLayout),
    commitTemplates: parseCommitTemplates(data.commitTemplates),
    gitConsole: pickBoolean(data.gitConsole, defaultPreferences.gitConsole),
    terminalShell: pickShell(data.terminalShell),
    terminalFontFamily: normalizeTerminalFontFamily(data.terminalFontFamily),
    terminalFontSize: pickNumber(
      data.terminalFontSize,
      defaultPreferences.terminalFontSize,
      ...FONT_SIZE_RANGE.terminal,
    ),
    terminalLineHeight: pickTenths(
      data.terminalLineHeight,
      defaultPreferences.terminalLineHeight,
      ...TERMINAL_LINE_HEIGHT_RANGE,
    ),
    terminalLetterSpacing: pickInteger(
      data.terminalLetterSpacing,
      defaultPreferences.terminalLetterSpacing,
      ...TERMINAL_LETTER_SPACING_RANGE,
    ),
    terminalFontWeight: pickOneOf(
      data.terminalFontWeight,
      TERMINAL_FONT_WEIGHTS,
      defaultPreferences.terminalFontWeight,
    ),
    terminalFontWeightBold: pickOneOf(
      data.terminalFontWeightBold,
      TERMINAL_FONT_WEIGHTS,
      defaultPreferences.terminalFontWeightBold,
    ),
    terminalLigatures: pickBoolean(data.terminalLigatures, defaultPreferences.terminalLigatures),
    terminalNerdFontIcons: pickBoolean(data.terminalNerdFontIcons, defaultPreferences.terminalNerdFontIcons),
    terminalCursorStyle: pickOneOf(
      data.terminalCursorStyle,
      TERMINAL_CURSOR_STYLES,
      defaultPreferences.terminalCursorStyle,
    ),
    terminalCursorBlink: pickBoolean(data.terminalCursorBlink, defaultPreferences.terminalCursorBlink),
    terminalScrollback: clampTerminalScrollback(data.terminalScrollback),
    terminalCopyOnSelect: pickBoolean(data.terminalCopyOnSelect, defaultPreferences.terminalCopyOnSelect),
    terminalFind: pickBoolean(data.terminalFind, defaultPreferences.terminalFind),
    terminalFileLinks: pickBoolean(data.terminalFileLinks, defaultPreferences.terminalFileLinks),
    terminalGpuAcceleration: pickBoolean(data.terminalGpuAcceleration, defaultPreferences.terminalGpuAcceleration),
    terminalUnicode11: pickBoolean(data.terminalUnicode11, defaultPreferences.terminalUnicode11),
    terminalOptionAsMeta: pickBoolean(data.terminalOptionAsMeta, defaultPreferences.terminalOptionAsMeta),
    terminalVisualBell: pickBoolean(data.terminalVisualBell, defaultPreferences.terminalVisualBell),
    terminalSmoothScrolling: pickBoolean(data.terminalSmoothScrolling, defaultPreferences.terminalSmoothScrolling),
    terminalDropPaths: pickBoolean(data.terminalDropPaths, defaultPreferences.terminalDropPaths),
    markdownViewMode: pickOneOf(data.markdownViewMode, MARKDOWN_VIEW_MODES, defaultPreferences.markdownViewMode),
    confirmDragAndDrop: pickBoolean(data.confirmDragAndDrop, defaultPreferences.confirmDragAndDrop),
    mcpEnabled: pickBoolean(data.mcpEnabled, defaultPreferences.mcpEnabled),
    cliEnabled: pickBoolean(data.cliEnabled, defaultPreferences.cliEnabled),
    mcpPort: parseMcpPort(data.mcpPort) ?? defaultPreferences.mcpPort,
    mcpTools: pickToolStates(data.mcpTools),
    keybindings: pickKeybindings(data.keybindings),
    aiPermissionMode: pickOneOf(data.aiPermissionMode, AI_PERMISSION_MODES, defaultPreferences.aiPermissionMode),
    aiAgentArgs: pickAgentArgs(data.aiAgentArgs),
    aiUsagePosition: pickOneOf(data.aiUsagePosition, AI_USAGE_POSITIONS, defaultPreferences.aiUsagePosition),
    computerAwakeMode: pickOneOf(data.computerAwakeMode, COMPUTER_AWAKE_MODES, defaultPreferences.computerAwakeMode),
    aiUsageHidden: AI_USAGE_PROVIDERS.map((provider) => provider.id).filter((id) =>
      pickStrings(data.aiUsageHidden).includes(id),
    ),
    aiAgentCommands: pickAgentCommands(data.aiAgentCommands),
    aiDefaultAgent:
      typeof data.aiDefaultAgent === "string" && AI_AGENT_ID.test(data.aiDefaultAgent) ? data.aiDefaultAgent : "",
    aiWorktreeLinks: Array.isArray(data.aiWorktreeLinks)
      ? pickStrings(data.aiWorktreeLinks)
          .map((name) => name.trim())
          .filter((name) => name !== "" && !name.includes("..") && name.length <= 200)
          .slice(0, 20)
      : defaultPreferences.aiWorktreeLinks,
    memoryLogEnabled: pickBoolean(data.memoryLogEnabled, defaultPreferences.memoryLogEnabled),
    memoryLogIntervalMs: pickInteger(
      data.memoryLogIntervalMs,
      defaultPreferences.memoryLogIntervalMs,
      ...MEMORY_LOG_INTERVAL_RANGE,
    ),
    memoryLogThresholdMb: pickNumber(
      data.memoryLogThresholdMb,
      defaultPreferences.memoryLogThresholdMb,
      ...MEMORY_LOG_THRESHOLD_RANGE,
    ),
    localHistoryEnabled: pickBoolean(data.localHistoryEnabled, defaultPreferences.localHistoryEnabled),
    localHistoryDays: pickInteger(
      data.localHistoryDays,
      defaultPreferences.localHistoryDays,
      ...LOCAL_HISTORY_DAYS_RANGE,
    ),
    localHistorySizeMb: pickInteger(
      data.localHistorySizeMb,
      defaultPreferences.localHistorySizeMb,
      ...LOCAL_HISTORY_SIZE_MB_RANGE,
    ),
    notificationsDoNotDisturb: pickBoolean(
      data.notificationsDoNotDisturb,
      defaultPreferences.notificationsDoNotDisturb,
    ),
  };
  const known = new Set(Object.keys(defaultPreferences));
  // Legacy browser storage mixed state into the same object; keep only real extras.
  const stateKeys = new Set(STATE_KEYS);
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key) && !stateKeys.has(key)));
  return { preferences, extra };
}

/** Preference keys whose value differs from the default, in display order; records compare by content. */
export function changedPreferenceKeys(current: Preferences): (keyof Preferences)[] {
  return (Object.keys(defaultPreferences) as (keyof Preferences)[]).filter((key) => {
    const value = current[key];
    const fallback = defaultPreferences[key];
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value) !== JSON.stringify(fallback);
    }
    return value !== fallback;
  });
}

/** Validates state.json; unknown keys come back in `extra` so a save keeps them. */
export function parseState(value: unknown): { state: UiState; extra: Json } {
  const data = asObject(value);
  const panel = data.leftPanel;
  const state: UiState = {
    // Older data called recent folders "recentRepos".
    recentRepos: pickStrings(data.recentFolders ?? data.recentRepos).slice(0, MAX_RECENT),
    recentWorkspaces: (Array.isArray(data.recentWorkspaces) ? data.recentWorkspaces : [])
      .map((folders: unknown) => pickStrings(folders))
      .filter((folders: string[]) => folders.length > 1)
      .slice(0, MAX_RECENT),
    lastSession: pickStrings(data.lastSession),
    lastSessionFile: pickString(data.lastSessionFile),
    sessionRecorded: Array.isArray(data.lastSession),
    recentWorkspaceFiles: pickStrings(data.recentWorkspaceFiles).slice(0, MAX_RECENT),
    lastRunVersion: pickString(data.lastRunVersion),
    skippedVersion: pickString(data.skippedVersion),
    activeRepos: Object.fromEntries(
      Object.entries(asObject(data.activeRepos)).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    activeRepoAuto: pickBoolean(data.activeRepoAuto, true),
    scriptNodeVersions: Object.fromEntries(
      Object.entries(asObject(data.scriptNodeVersions))
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
        .slice(-MAX_SCRIPT_NODE_VERSIONS),
    ),
    explorerOpen: pickBoolean(data.explorerOpen, true),
    rightPanel: data.rightPanel === "ai" || data.rightPanel === "notifications" ? data.rightPanel : "files",
    leftBarVisible: pickBoolean(data.leftBarVisible, true),
    rightBarVisible: pickBoolean(data.rightBarVisible, true),
    diffSplitRatio: pickNumber(data.diffSplitRatio, 0.5, 0.15, 0.85),
    threePaneSplit: readThreeSplit(data.threePaneSplit),
    mergeStackHeight: pickNumber(data.mergeStackHeight, 0, 0, 4000),
    mergeStackRatio: pickNumber(data.mergeStackRatio, 0.5, 0.15, 0.85),
    leftPanel: panel === "changes" || panel === "branches" || panel === "scripts" || panel === null ? panel : "changes",
    sidebarWidth: pickNumber(data.sidebarWidth, DEFAULT_PANEL_WIDTH, 120, 2000),
    explorerWidth: pickNumber(data.explorerWidth, DEFAULT_PANEL_WIDTH, 120, 2000),
    commitInfoHeight: pickNumber(data.commitInfoHeight, DEFAULT_COMMIT_INFO_HEIGHT, 80, 2000),
    terminalHeight: pickNumber(data.terminalHeight, DEFAULT_TERMINAL_HEIGHT, MIN_TERMINAL_HEIGHT, 2000),
    terminalListWidth: pickNumber(data.terminalListWidth, DEFAULT_TERMINAL_LIST_WIDTH, MIN_TERMINAL_LIST_WIDTH, 1200),
    changesListWidth: pickNumber(data.changesListWidth, DEFAULT_CHANGES_LIST_WIDTH, MIN_CHANGES_LIST_WIDTH, 2000),
    changesListVisible: pickBoolean(data.changesListVisible, true),
    markdownPreviewRatio: pickNumber(
      data.markdownPreviewRatio,
      DEFAULT_MARKDOWN_PREVIEW_RATIO,
      ...MARKDOWN_PREVIEW_RATIO_RANGE,
    ),
    recentCommands: pickRecentCommands(data.recentCommands),
    commitMessages: parseMessageHistory(data.commitMessages),
    openTabs: parseTabSessions(data.openTabs),
    recentFileLists: parseRecentFiles(data.recentFileLists),
  };
  const known = new Set([...STATE_KEYS, ...Object.keys(defaultPreferences)]);
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)));
  return { state, extra };
}

/** The JSON written to state.json. */
/**
 * state.json keys each window keeps for itself: a window's panel sizes and open panels, and
 * the folders it reopens. Another window changing them does not move this window's layout.
 * `windows` (the window session) is written by the backend only.
 */
export const WINDOW_STATE_KEYS = [
  "lastSession",
  "lastSessionFile",
  "explorerOpen",
  "rightPanel",
  "leftBarVisible",
  "rightBarVisible",
  "diffSplitRatio",
  "threePaneSplit",
  "mergeStackHeight",
  "mergeStackRatio",
  "leftPanel",
  "sidebarWidth",
  "explorerWidth",
  "commitInfoHeight",
  "terminalHeight",
  "terminalListWidth",
  "markdownPreviewRatio",
  "windows",
] as const;

export function stateToJson(state: UiState, extra: Json): Json {
  return {
    ...extra,
    recentFolders: state.recentRepos,
    recentWorkspaces: state.recentWorkspaces,
    lastSession: state.lastSession,
    lastSessionFile: state.lastSessionFile,
    recentWorkspaceFiles: state.recentWorkspaceFiles,
    lastRunVersion: state.lastRunVersion,
    skippedVersion: state.skippedVersion,
    activeRepos: state.activeRepos,
    scriptNodeVersions: state.scriptNodeVersions,
    explorerOpen: state.explorerOpen,
    rightPanel: state.rightPanel,
    leftBarVisible: state.leftBarVisible,
    rightBarVisible: state.rightBarVisible,
    diffSplitRatio: state.diffSplitRatio,
    threePaneSplit: [...state.threePaneSplit],
    mergeStackHeight: state.mergeStackHeight,
    mergeStackRatio: state.mergeStackRatio,
    leftPanel: state.leftPanel,
    sidebarWidth: state.sidebarWidth,
    explorerWidth: state.explorerWidth,
    commitInfoHeight: state.commitInfoHeight,
    terminalHeight: state.terminalHeight,
    terminalListWidth: state.terminalListWidth,
    changesListWidth: state.changesListWidth,
    changesListVisible: state.changesListVisible,
    markdownPreviewRatio: state.markdownPreviewRatio,
    recentCommands: state.recentCommands,
    commitMessages: state.commitMessages,
    openTabs: state.openTabs,
    recentFileLists: state.recentFileLists,
  };
}

/** Parse errors per file; null when the file was read fine or does not exist. */
export type LoadErrors = Record<ConfigName, string | null>;

/**
 * Files a save may write. A file that failed to parse is never overwritten
 * automatically: the user may be fixing it by hand, and it may still hold
 * their recent folders or preferences.
 */
export function writableConfigs(loadErrors: LoadErrors): ConfigName[] {
  return (["state", "settings"] as const).filter((configName) => loadErrors[configName] === null);
}

/** Old browser-storage settings are migrated only on a real first run: no files and no errors. */
export function shouldMigrateLegacy(loaded: Record<ConfigName, unknown>, loadErrors: LoadErrors): boolean {
  return loaded.settings === null && loaded.state === null && loadErrors.settings === null && loadErrors.state === null;
}

export type SessionStep = { kind: "workspaceFile"; filePath: string } | { kind: "folders"; folderPaths: string[] };

/**
 * What to reopen on start without a folder argument, tried in order until one
 * opens. An empty recorded session means the user closed the folder, so the
 * welcome screen shows; the most recent folder is only a fallback for state
 * written before sessions were recorded.
 */
export function sessionSteps(
  state: Pick<UiState, "lastSession" | "lastSessionFile" | "sessionRecorded" | "recentRepos">,
): SessionStep[] {
  const steps: SessionStep[] = [];
  if (state.lastSessionFile) {
    steps.push({ kind: "workspaceFile", filePath: state.lastSessionFile });
  }
  if (state.lastSession.length > 0) {
    steps.push({ kind: "folders", folderPaths: state.lastSession });
  } else if (!state.sessionRecorded && state.recentRepos[0]) {
    steps.push({ kind: "folders", folderPaths: [state.recentRepos[0]] });
  }
  return steps;
}
