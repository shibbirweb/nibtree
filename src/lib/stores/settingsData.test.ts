import { describe, expect, it } from "vitest";
import {
  EDITOR_FONT_WEIGHT_RANGE,
  EDITOR_LINE_HEIGHT_RANGE,
  EDITOR_RULER_RANGE,
  changedPreferenceKeys,
  clampTerminalScrollback,
  DEFAULT_EDITOR_FONT,
  DEFAULT_MCP_PORT,
  DEFAULT_COMMIT_INFO_HEIGHT,
  DEFAULT_PANEL_WIDTH,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_LIST_WIDTH,
  DEFAULT_CHANGES_LIST_WIDTH,
  defaultPreferences,
  fontWeightName,
  MAX_MCP_TOOL_STATES,
  MIN_TERMINAL_HEIGHT,
  MIN_TERMINAL_LIST_WIDTH,
  MIN_CHANGES_LIST_WIDTH,
  normalizeTerminalFontFamily,
  parseMcpPort,
  parsePreferences,
  parseState,
  pickRulerColumn,
  pickToolStates,
  sessionSteps,
  shouldMigrateLegacy,
  stateToJson,
  WINDOW_STATE_KEYS,
  writableConfigs,
} from "./settingsData";

const noErrors = { settings: null, state: null };

describe("parsePreferences", () => {
  it("reads the AI settings and drops what it does not know", () => {
    const defaults = parsePreferences({}).preferences;
    expect([defaults.aiUsagePosition, defaults.aiUsageHidden, defaults.aiAgentCommands]).toEqual(["right", [], {}]);
    const parsed = parsePreferences({
      aiUsagePosition: "left",
      aiUsageHidden: ["codex", "gemini", 3, "codex"],
      aiAgentCommands: {
        claude: { command: "claude-beta", fullAutonomyArgs: "", promptStyle: "typed", promptFlag: " " },
        "Bad Id": { command: "x" },
        codex: { promptStyle: "shout" },
      },
    }).preferences;
    expect(parsed.aiUsagePosition).toBe("left");
    expect(parsed.aiUsageHidden).toEqual(["codex"]);
    expect(parsed.aiAgentCommands).toEqual({
      claude: { command: "claude-beta", fullAutonomyArgs: "", promptStyle: "typed" },
    });
    expect(parsePreferences({ aiUsagePosition: "top" }).preferences.aiUsagePosition).toBe("right");
  });

  it("renders whitespace in selections unless another mode was picked", () => {
    expect(parsePreferences({}).preferences.renderWhitespace).toBe("selection");
    expect(parsePreferences({ renderWhitespace: "trailing" }).preferences.renderWhitespace).toBe("trailing");
    expect(parsePreferences({ renderWhitespace: "dots" }).preferences.renderWhitespace).toBe("selection");
  });

  it("starts with the default cursor and keeps hand-edited cursor values in range", () => {
    const parsed = parsePreferences({}).preferences;
    expect([
      parsed.editorCursorStyle,
      parsed.editorCursorWidth,
      parsed.editorCursorBlinking,
      parsed.editorCursorSmoothCaret,
    ]).toEqual(["line", 2, "blink", false]);
    expect([parsed.editorCaretExtraTop, parsed.editorCaretExtraBottom]).toEqual([0, 0]);
    const custom = parsePreferences({
      editorCursorStyle: "block-outline",
      editorCursorWidth: 9,
      editorCursorBlinking: "expand",
      editorCursorSmoothCaret: true,
      editorCaretExtraTop: 2.6,
      editorCaretExtraBottom: -4,
    }).preferences;
    expect([
      custom.editorCursorStyle,
      custom.editorCursorWidth,
      custom.editorCursorBlinking,
      custom.editorCursorSmoothCaret,
    ]).toEqual(["block-outline", 6, "expand", true]);
    expect([custom.editorCaretExtraTop, custom.editorCaretExtraBottom]).toEqual([3, 0]);
    const wrong = parsePreferences({
      editorCursorStyle: "bar",
      editorCursorBlinking: "fast",
      editorCaretExtraTop: "2",
    }).preferences;
    expect([wrong.editorCursorStyle, wrong.editorCursorBlinking, wrong.editorCaretExtraTop]).toEqual([
      "line",
      "blink",
      0,
    ]);
  });

  it("keeps the memory log off and its numbers in range", () => {
    const parsed = parsePreferences({}).preferences;
    expect([parsed.memoryLogEnabled, parsed.memoryLogIntervalMs, parsed.memoryLogThresholdMb]).toEqual([false, 500, 5]);
    const custom = parsePreferences({
      memoryLogEnabled: true,
      memoryLogIntervalMs: 20,
      memoryLogThresholdMb: 9000,
    }).preferences;
    expect([custom.memoryLogEnabled, custom.memoryLogIntervalMs, custom.memoryLogThresholdMb]).toEqual([
      true,
      100,
      500,
    ]);
    expect(parsePreferences({ memoryLogThresholdMb: "x" }).preferences.memoryLogThresholdMb).toBe(5);
  });

  it("keeps Local History on for 7 days and 200 MB, within range", () => {
    const keys = [
      "localHistoryEnabled",
      "localHistoryDays",
      "localHistorySizeMb",
      "notificationsDoNotDisturb",
    ] as const;
    const values = (data: Record<string, unknown>) => {
      const preferences = parsePreferences(data).preferences;
      return keys.map((key) => preferences[key]);
    };
    expect(values({})).toEqual([true, 7, 200, false]);
    expect(
      values({
        localHistoryEnabled: false,
        localHistoryDays: 500,
        localHistorySizeMb: 1,
        notificationsDoNotDisturb: true,
      }),
    ).toEqual([false, 90, 10, true]);
    expect(
      values({
        localHistoryEnabled: "no",
        localHistoryDays: "3",
        localHistorySizeMb: null,
        notificationsDoNotDisturb: 1,
      }),
    ).toEqual([true, 7, 200, false]);
  });

  it("keeps the Git Console off unless it was turned on", () => {
    expect(parsePreferences({}).preferences.gitConsole).toBe(false);
    expect(parsePreferences({ gitConsole: true }).preferences.gitConsole).toBe(true);
    expect(parsePreferences({ gitConsole: "yes" }).preferences.gitConsole).toBe(false);
  });

  it("keeps the MCP server and the command line tool off unless turned on", () => {
    const preferences = parsePreferences({}).preferences;
    expect(preferences.mcpEnabled).toBe(false);
    expect(preferences.cliEnabled).toBe(false);
    expect(parsePreferences({ mcpEnabled: true, cliEnabled: true }).preferences).toMatchObject({
      mcpEnabled: true,
      cliEnabled: true,
    });
    expect(parsePreferences({ mcpEnabled: "on", cliEnabled: 1 }).preferences).toMatchObject({
      mcpEnabled: false,
      cliEnabled: false,
    });
  });

  it("accepts only whole MCP ports from 1024 to 65535", () => {
    expect(parsePreferences({}).preferences.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(parsePreferences({ mcpPort: 50000 }).preferences.mcpPort).toBe(50000);
    expect(parsePreferences({ mcpPort: 80 }).preferences.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(parsePreferences({ mcpPort: 70000 }).preferences.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(parsePreferences({ mcpPort: 5000.5 }).preferences.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(parsePreferences({ mcpPort: "50000" }).preferences.mcpPort).toBe(50000);
    expect(parseMcpPort(" 1024 ")).toBe(1024);
    expect(parseMcpPort("")).toBeNull();
    expect(parseMcpPort("abc")).toBeNull();
    expect(parseMcpPort(65535)).toBe(65535);
    expect(parseMcpPort(65536)).toBeNull();
  });

  it("keeps only true or false tool switches with valid names", () => {
    expect(parsePreferences({}).preferences.mcpTools).toEqual({});
    expect(
      parsePreferences({
        mcpTools: { git_status: false, send_terminal_text: true, bad: "yes", "Not A Name": true, n: null },
      }).preferences.mcpTools,
    ).toEqual({ git_status: false, send_terminal_text: true });
    expect(pickToolStates(["git_status"])).toEqual({});
    expect(pickToolStates("git_status")).toEqual({});
  });

  it("caps the tool switches", () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_MCP_TOOL_STATES + 50 }, (_, index) => [`tool_${index}`, false]),
    );
    expect(Object.keys(pickToolStates(many))).toHaveLength(MAX_MCP_TOOL_STATES);
  });

  it("validates the editor line spacing", () => {
    expect(parsePreferences({}).preferences.editorLineHeight).toBe(1.25);
    expect(parsePreferences({ editorLineHeight: 1.8 }).preferences.editorLineHeight).toBe(1.8);
    expect(parsePreferences({ editorLineHeight: 0.5 }).preferences.editorLineHeight).toBe(EDITOR_LINE_HEIGHT_RANGE[0]);
    expect(parsePreferences({ editorLineHeight: 9 }).preferences.editorLineHeight).toBe(EDITOR_LINE_HEIGHT_RANGE[1]);
    expect(parsePreferences({ editorLineHeight: 1.5499999 }).preferences.editorLineHeight).toBe(1.55);
    expect(parsePreferences({ editorLineHeight: "loose" }).preferences.editorLineHeight).toBe(1.25);
    expect(parsePreferences({ editorLineHeight: 1.8 }).extra).toEqual({});
  });

  it("validates the editor font weight", () => {
    expect(parsePreferences({}).preferences.editorFontWeight).toBe(400);
    expect(parsePreferences({ editorFontWeight: 300 }).preferences.editorFontWeight).toBe(300);
    expect(parsePreferences({ editorFontWeight: 20 }).preferences.editorFontWeight).toBe(EDITOR_FONT_WEIGHT_RANGE[0]);
    expect(parsePreferences({ editorFontWeight: 1000 }).preferences.editorFontWeight).toBe(EDITOR_FONT_WEIGHT_RANGE[1]);
    expect(parsePreferences({ editorFontWeight: 349 }).preferences.editorFontWeight).toBe(300);
    expect(parsePreferences({ editorFontWeight: "bold" }).preferences.editorFontWeight).toBe(400);
    expect(parsePreferences({ editorFontWeight: 300 }).extra).toEqual({});
  });

  it("names font weights like the font styles", () => {
    expect(fontWeightName(100)).toBe("Thin");
    expect(fontWeightName(300)).toBe("Light");
    expect(fontWeightName(400)).toBe("Regular");
    expect(fontWeightName(900)).toBe("Black");
    expect(fontWeightName(350)).toBe("350");
  });

  it("defaults the editor to 13 px JetBrains Mono, falling back to Menlo, then Windows' code fonts", () => {
    expect(defaultPreferences.editorFontSize).toBe(13);
    expect(DEFAULT_EDITOR_FONT).toBe(
      "'JetBrains Mono', Menlo, Monaco, 'Cascadia Mono', Consolas, 'Courier New', monospace",
    );
    // A saved value is kept, so changing a default never touches what the user picked.
    expect(parsePreferences({ editorFontSize: 12.5, editorLineHeight: 1.55 }).preferences).toMatchObject({
      editorFontSize: 12.5,
      editorLineHeight: 1.55,
    });
  });

  it("validates the diff layout", () => {
    expect(parsePreferences({}).preferences.diffLayout).toBe("sideBySide");
    expect(parsePreferences({ diffLayout: "inline" }).preferences.diffLayout).toBe("inline");
    expect(parsePreferences({ diffLayout: "unified" }).preferences.diffLayout).toBe("sideBySide");
    expect(parsePreferences({}).preferences.changesDiffPanes).toBe("two");
    expect(parsePreferences({}).preferences.mergeDiffPanes).toBe("three");
    expect(parsePreferences({ changesDiffPanes: "three" }).preferences.changesDiffPanes).toBe("three");
    expect(parsePreferences({ mergeDiffPanes: 3 }).preferences.mergeDiffPanes).toBe("three");
    expect(parsePreferences({ mergeDiffPanes: "two" }).preferences.mergeDiffPanes).toBe("two");
  });

  it("validates the commit box layout", () => {
    expect(parsePreferences({}).preferences.commitBoxLayout).toBe("single");
    expect(parsePreferences({ commitBoxLayout: "perRepo" }).preferences.commitBoxLayout).toBe("perRepo");
    expect(parsePreferences({ commitBoxLayout: "both" }).preferences.commitBoxLayout).toBe("single");
  });

  it("turns the editor features on by default and keeps hand-edited switches", () => {
    const { preferences } = parsePreferences({});
    expect(preferences).toMatchObject({
      editorAutoCloseBrackets: true,
      editorCompletion: true,
      editorCompletionOnTyping: true,
      editorFoldGutter: true,
      editorIndentGuides: true,
      editorHighlightWord: true,
      editorScrollPastEnd: true,
      editorColumnSelection: true,
      editorRulerColumn: 0,
      editorStickyScroll: true,
      editorMinimap: false,
      editorBracketPairColors: true,
      editorMatchBrackets: true,
    });
    const edited = parsePreferences({
      editorCompletion: false,
      editorFoldGutter: "no",
      editorIndentGuides: false,
    }).preferences;
    expect(edited.editorCompletion).toBe(false);
    expect(edited.editorFoldGutter).toBe(true);
    const extras = parsePreferences({
      editorStickyScroll: false,
      editorMinimap: true,
      editorBracketPairColors: 1,
      editorMatchBrackets: false,
    }).preferences;
    expect(extras.editorStickyScroll).toBe(false);
    expect(extras.editorMinimap).toBe(true);
    expect(defaultPreferences.detectIndentation).toBe(true);
    expect(defaultPreferences.fileIcons).toBe("off");
    expect(parsePreferences({ fileIcons: "material" }).preferences.fileIcons).toBe("material");
    expect(parsePreferences({ fileIcons: "minimal" }).preferences.fileIcons).toBe("minimal");
    expect(parsePreferences({ fileIcons: true }).preferences.fileIcons).toBe("off");
    expect(defaultPreferences.mergeLayout).toBe("columns");
    expect(parsePreferences({ mergeLayout: "stacked" }).preferences.mergeLayout).toBe("stacked");
    expect(parsePreferences({ mergeLayout: "rows" }).preferences.mergeLayout).toBe("columns");
    expect(defaultPreferences.roundedPanels).toBe(false);
    expect(parsePreferences({ roundedPanels: true }).preferences.roundedPanels).toBe(true);
    expect(parsePreferences({ roundedPanels: "yes" }).preferences.roundedPanels).toBe(false);
    expect(defaultPreferences.projectColorHeader).toBe(true);
    expect(parsePreferences({ projectColorHeader: false }).preferences.projectColorHeader).toBe(false);
    expect(parsePreferences({ projectColorHeader: "no" }).preferences.projectColorHeader).toBe(true);
    expect(defaultPreferences.fileToolbar).toBe("top");
    expect(parsePreferences({ fileToolbar: "bottom" }).preferences.fileToolbar).toBe("bottom");
    expect(parsePreferences({ fileToolbar: "none" }).preferences.fileToolbar).toBe("none");
    expect(parsePreferences({ fileToolbar: "left" }).preferences.fileToolbar).toBe("top");
    expect(defaultPreferences.fileToolbarBlame).toBe(true);
    expect(parsePreferences({ fileToolbarBlame: false }).preferences.fileToolbarBlame).toBe(false);
    expect(parsePreferences({ fileToolbarBreadcrumbs: "no" }).preferences.fileToolbarBreadcrumbs).toBe(true);
    expect(parsePreferences({ detectIndentation: false }).preferences.detectIndentation).toBe(false);
    expect(parsePreferences({ detectIndentation: "no" }).preferences.detectIndentation).toBe(true);
    expect(extras.editorBracketPairColors).toBe(true);
    expect(extras.editorMatchBrackets).toBe(false);
    expect(edited.editorIndentGuides).toBe(false);
  });

  it("keeps the margin column whole and in range, 0 for off", () => {
    expect(pickRulerColumn(120)).toBe(120);
    expect(pickRulerColumn(80.4)).toBe(80);
    expect(pickRulerColumn(9999)).toBe(EDITOR_RULER_RANGE[1]);
    expect(pickRulerColumn(0)).toBe(0);
    expect(pickRulerColumn(-5)).toBe(0);
    expect(pickRulerColumn(0.3)).toBe(0);
    expect(pickRulerColumn("120")).toBe(0);
    expect(pickRulerColumn(Number.NaN)).toBe(0);
    expect(parsePreferences({ editorRulerColumn: 100 }).preferences.editorRulerColumn).toBe(100);
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(parsePreferences(null).preferences).toEqual(defaultPreferences);
    const { preferences } = parsePreferences({
      theme: "neon",
      tabSize: 3,
      uiFontSize: 99,
      wordWrap: "yes",
      updateChannel: "beta",
    });
    expect(preferences.theme).toBe("system");
    expect(preferences.tabSize).toBe(4);
    expect(preferences.uiFontSize).toBe(16);
    expect(preferences.wordWrap).toBe(false);
    expect(preferences.updateChannel).toBe("beta");
  });

  it("validates the Update Project method", () => {
    expect(defaultPreferences.updateMethod).toBe("merge");
    expect(parsePreferences({ updateMethod: "rebase" }).preferences.updateMethod).toBe("rebase");
    expect(parsePreferences({ updateMethod: "squash" }).preferences.updateMethod).toBe("merge");
  });

  it("validates the Markdown view mode", () => {
    expect(defaultPreferences.markdownViewMode).toBe("split");
    expect(parsePreferences({ markdownViewMode: "preview" }).preferences.markdownViewMode).toBe("preview");
    expect(parsePreferences({ markdownViewMode: "editor" }).preferences.markdownViewMode).toBe("editor");
    expect(parsePreferences({ markdownViewMode: "side" }).preferences.markdownViewMode).toBe("split");
    expect(parsePreferences({ markdownViewMode: "preview" }).extra).toEqual({});
  });

  it("validates the tab and saving settings", () => {
    const defaults = parsePreferences({}).preferences;
    expect([defaults.reopenTabsOnStart, defaults.tabLimit, defaults.autoSave, defaults.autoSaveDelayMs]).toEqual([
      true,
      0,
      "off",
      1000,
    ]);
    expect([defaults.trimTrailingWhitespace, defaults.insertFinalNewline, defaults.trimFinalNewlines]).toEqual([
      false,
      false,
      false,
    ]);
    const custom = parsePreferences({
      reopenTabsOnStart: false,
      tabLimit: 1,
      autoSave: "onFocusChange",
      autoSaveDelayMs: 2500.4,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
      trimFinalNewlines: true,
    });
    expect(custom.preferences).toMatchObject({
      reopenTabsOnStart: false,
      tabLimit: 1,
      autoSave: "onFocusChange",
      autoSaveDelayMs: 2500,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
      trimFinalNewlines: true,
    });
    expect(custom.extra).toEqual({});
    const wrong = parsePreferences({
      reopenTabsOnStart: "no",
      tabLimit: -2,
      autoSave: "always",
      autoSaveDelayMs: 5,
      insertFinalNewline: 1,
    }).preferences;
    expect([
      wrong.reopenTabsOnStart,
      wrong.tabLimit,
      wrong.autoSave,
      wrong.autoSaveDelayMs,
      wrong.insertFinalNewline,
    ]).toEqual([true, 0, "off", 100, false]);
    expect(parsePreferences({ tabLimit: 500 }).preferences.tabLimit).toBe(100);
  });

  it("remembers unsaved changes unless turned off", () => {
    expect(defaultPreferences.rememberUnsaved).toBe(true);
    expect(parsePreferences({ rememberUnsaved: false }).preferences.rememberUnsaved).toBe(false);
    expect(parsePreferences({ rememberUnsaved: "no" }).preferences.rememberUnsaved).toBe(true);
  });

  it("asks before drag and drop moves unless turned off", () => {
    expect(defaultPreferences.confirmDragAndDrop).toBe(true);
    expect(parsePreferences({}).preferences.confirmDragAndDrop).toBe(true);
    expect(parsePreferences({ confirmDragAndDrop: false }).preferences.confirmDragAndDrop).toBe(false);
    expect(parsePreferences({ confirmDragAndDrop: "no" }).preferences.confirmDragAndDrop).toBe(true);
    expect(parsePreferences({ confirmDragAndDrop: 0 }).preferences.confirmDragAndDrop).toBe(true);
    expect(parsePreferences({ confirmDragAndDrop: false }).extra).toEqual({});
  });

  it("defaults the terminal to the login shell and 12.5 px", () => {
    expect(defaultPreferences.terminalShell).toBeNull();
    expect(defaultPreferences.terminalFontSize).toBe(13);
    expect(parsePreferences({}).preferences.terminalShell).toBeNull();
  });

  it("validates the terminal shell and font size", () => {
    expect(parsePreferences({ terminalShell: "/bin/bash" }).preferences.terminalShell).toBe("/bin/bash");
    expect(parsePreferences({ terminalShell: "  /opt/homebrew/bin/fish " }).preferences.terminalShell).toBe(
      "/opt/homebrew/bin/fish",
    );
    expect(parsePreferences({ terminalShell: "" }).preferences.terminalShell).toBeNull();
    expect(parsePreferences({ terminalShell: 7 }).preferences.terminalShell).toBeNull();
    expect(parsePreferences({ terminalShell: "x".repeat(2000) }).preferences.terminalShell).toBeNull();
    expect(parsePreferences({ terminalFontSize: 14 }).preferences.terminalFontSize).toBe(14);
    expect(parsePreferences({ terminalFontSize: 99 }).preferences.terminalFontSize).toBe(24);
    expect(parsePreferences({ terminalFontSize: 2 }).preferences.terminalFontSize).toBe(9);
    expect(parsePreferences({ terminalFontSize: "big" }).preferences.terminalFontSize).toBe(13);
    // A saved size stays, so people who never changed it keep what they had.
    expect(parsePreferences({ terminalFontSize: 12.5 }).preferences.terminalFontSize).toBe(12.5);
  });

  it("defaults the terminal display settings", () => {
    const { preferences } = parsePreferences({});
    expect(preferences.terminalFontFamily).toBe("");
    expect(preferences.terminalLineHeight).toBe(1.2);
    expect(preferences.terminalLetterSpacing).toBe(0);
    expect(preferences.terminalFontWeight).toBe("normal");
    expect(preferences.terminalFontWeightBold).toBe("bold");
    expect(preferences.terminalLigatures).toBe(false);
    expect(preferences.terminalNerdFontIcons).toBe(true);
    expect(preferences.terminalCursorStyle).toBe("block");
    expect(preferences.terminalCursorBlink).toBe(true);
    expect(preferences.terminalScrollback).toBe(5000);
    expect(preferences.terminalCopyOnSelect).toBe(false);
  });

  it("keeps an empty terminal font family and cleans any other", () => {
    expect(parsePreferences({ terminalFontFamily: "" }).preferences.terminalFontFamily).toBe("");
    expect(parsePreferences({ terminalFontFamily: "   " }).preferences.terminalFontFamily).toBe("");
    expect(parsePreferences({ terminalFontFamily: 12 }).preferences.terminalFontFamily).toBe("");
    expect(parsePreferences({ terminalFontFamily: " 'MesloLGS NF' ,Menlo" }).preferences.terminalFontFamily).toBe(
      "'MesloLGS NF', Menlo, monospace",
    );
    expect(parsePreferences({ terminalFontFamily: "Menlo; color: red" }).preferences.terminalFontFamily).toBe(
      "Menlo color: red, monospace",
    );
    expect(normalizeTerminalFontFamily(DEFAULT_EDITOR_FONT)).toBe(DEFAULT_EDITOR_FONT);
    expect(normalizeTerminalFontFamily(null)).toBe("");
  });

  it("clamps the terminal line height and letter spacing", () => {
    expect(parsePreferences({ terminalLineHeight: 1.5 }).preferences.terminalLineHeight).toBe(1.5);
    expect(parsePreferences({ terminalLineHeight: 1.234 }).preferences.terminalLineHeight).toBe(1.2);
    expect(parsePreferences({ terminalLineHeight: 0.5 }).preferences.terminalLineHeight).toBe(1);
    expect(parsePreferences({ terminalLineHeight: 9 }).preferences.terminalLineHeight).toBe(2);
    expect(parsePreferences({ terminalLineHeight: "tall" }).preferences.terminalLineHeight).toBe(1.2);
    expect(parsePreferences({ terminalLineHeight: Number.NaN }).preferences.terminalLineHeight).toBe(1.2);
    expect(parsePreferences({ terminalLineHeight: 1 }).preferences.terminalLineHeight).toBe(1);
    expect(parsePreferences({ terminalLetterSpacing: 2 }).preferences.terminalLetterSpacing).toBe(2);
    expect(parsePreferences({ terminalLetterSpacing: 1.6 }).preferences.terminalLetterSpacing).toBe(2);
    expect(parsePreferences({ terminalLetterSpacing: -3 }).preferences.terminalLetterSpacing).toBe(0);
    expect(parsePreferences({ terminalLetterSpacing: 40 }).preferences.terminalLetterSpacing).toBe(5);
    expect(parsePreferences({ terminalLetterSpacing: "wide" }).preferences.terminalLetterSpacing).toBe(0);
  });

  it("accepts only known terminal font weights and cursor styles", () => {
    expect(parsePreferences({ terminalFontWeight: "medium" }).preferences.terminalFontWeight).toBe("medium");
    expect(parsePreferences({ terminalFontWeight: "bold" }).preferences.terminalFontWeight).toBe("bold");
    expect(parsePreferences({ terminalFontWeight: "900" }).preferences.terminalFontWeight).toBe("normal");
    expect(parsePreferences({ terminalFontWeight: 500 }).preferences.terminalFontWeight).toBe("normal");
    expect(parsePreferences({ terminalFontWeightBold: "medium" }).preferences.terminalFontWeightBold).toBe("medium");
    expect(parsePreferences({ terminalFontWeightBold: "normal" }).preferences.terminalFontWeightBold).toBe("normal");
    expect(parsePreferences({ terminalFontWeightBold: "heavy" }).preferences.terminalFontWeightBold).toBe("bold");
    expect(parsePreferences({ terminalCursorStyle: "bar" }).preferences.terminalCursorStyle).toBe("bar");
    expect(parsePreferences({ terminalCursorStyle: "underline" }).preferences.terminalCursorStyle).toBe("underline");
    expect(parsePreferences({ terminalCursorStyle: "outline" }).preferences.terminalCursorStyle).toBe("block");
    expect(parsePreferences({ terminalCursorStyle: null }).preferences.terminalCursorStyle).toBe("block");
  });

  it("validates the terminal switches", () => {
    const { preferences } = parsePreferences({
      terminalLigatures: true,
      terminalNerdFontIcons: false,
      terminalCursorBlink: false,
      terminalCopyOnSelect: true,
    });
    expect(preferences.terminalLigatures).toBe(true);
    expect(preferences.terminalNerdFontIcons).toBe(false);
    expect(preferences.terminalCursorBlink).toBe(false);
    expect(preferences.terminalCopyOnSelect).toBe(true);
    const invalid = parsePreferences({
      terminalLigatures: "on",
      terminalNerdFontIcons: 0,
      terminalCursorBlink: "no",
      terminalCopyOnSelect: 1,
    }).preferences;
    expect(invalid.terminalLigatures).toBe(false);
    expect(invalid.terminalNerdFontIcons).toBe(true);
    expect(invalid.terminalCursorBlink).toBe(true);
    expect(invalid.terminalCopyOnSelect).toBe(false);
  });

  it("defaults the optional terminal parts and validates them", () => {
    const defaults = parsePreferences({}).preferences;
    expect(defaults.terminalFind).toBe(true);
    expect(defaults.terminalFileLinks).toBe(true);
    expect(defaults.terminalGpuAcceleration).toBe(true);
    expect(defaults.terminalUnicode11).toBe(true);
    expect(defaults.terminalOptionAsMeta).toBe(false);
    expect(defaults.terminalVisualBell).toBe(true);
    expect(defaults.terminalSmoothScrolling).toBe(false);
    expect(defaults.terminalDropPaths).toBe(true);
    const flipped = parsePreferences({
      terminalFind: false,
      terminalFileLinks: false,
      terminalGpuAcceleration: false,
      terminalUnicode11: false,
      terminalOptionAsMeta: true,
      terminalVisualBell: false,
      terminalSmoothScrolling: true,
      terminalDropPaths: false,
    });
    expect(flipped.preferences).toMatchObject({
      terminalFind: false,
      terminalFileLinks: false,
      terminalGpuAcceleration: false,
      terminalUnicode11: false,
      terminalOptionAsMeta: true,
      terminalVisualBell: false,
      terminalSmoothScrolling: true,
      terminalDropPaths: false,
    });
    expect(flipped.extra).toEqual({});
    const invalid = parsePreferences({
      terminalFind: "off",
      terminalOptionAsMeta: 1,
      terminalSmoothScrolling: "yes",
    }).preferences;
    expect(invalid.terminalFind).toBe(true);
    expect(invalid.terminalOptionAsMeta).toBe(false);
    expect(invalid.terminalSmoothScrolling).toBe(false);
  });

  it("clamps the terminal scrollback to whole lines", () => {
    expect(parsePreferences({ terminalScrollback: 20000 }).preferences.terminalScrollback).toBe(20000);
    expect(parsePreferences({ terminalScrollback: 12345.6 }).preferences.terminalScrollback).toBe(12346);
    expect(parsePreferences({ terminalScrollback: 10 }).preferences.terminalScrollback).toBe(1000);
    expect(parsePreferences({ terminalScrollback: 1e9 }).preferences.terminalScrollback).toBe(100000);
    expect(parsePreferences({ terminalScrollback: "lots" }).preferences.terminalScrollback).toBe(5000);
    expect(parsePreferences({ terminalScrollback: Number.POSITIVE_INFINITY }).preferences.terminalScrollback).toBe(
      5000,
    );
    expect(clampTerminalScrollback(500)).toBe(1000);
    expect(clampTerminalScrollback(null)).toBe(5000);
  });

  it("treats the terminal keys as known, not as extras", () => {
    const { preferences, extra } = parsePreferences({ ...defaultPreferences, terminalScrollback: 9000 });
    expect(extra).toEqual({});
    expect(preferences).toEqual({ ...defaultPreferences, terminalScrollback: 9000 });
  });

  it("keeps unknown keys but drops state keys mixed in by legacy storage", () => {
    const { extra } = parsePreferences({ theme: "dark", futureOption: 1, recentRepos: ["/a"], sidebarWidth: 300 });
    expect(extra).toEqual({ futureOption: 1 });
  });
});

describe("parseState", () => {
  it("validates every value and keeps unknown keys", () => {
    const { state, extra } = parseState({
      recentFolders: ["/a", 3, "/b"],
      recentWorkspaces: [["/a", "/b"], ["/single"], "bad"],
      lastSession: ["/a"],
      lastSessionFile: 7,
      activeRepos: { "/a": "/a/web", "/b": false },
      activeRepoAuto: "yes",
      leftPanel: "nope",
      sidebarWidth: 10,
      somethingNew: true,
    });
    expect(state.recentRepos).toEqual(["/a", "/b"]);
    expect(state.recentWorkspaces).toEqual([["/a", "/b"]]);
    expect(state.lastSessionFile).toBeNull();
    expect(state.activeRepos).toEqual({ "/a": "/a/web" });
    expect(state.activeRepoAuto).toBe(true);
    expect(state.leftPanel).toBe("changes");
    expect(state.sidebarWidth).toBe(120);
    expect(state.explorerWidth).toBe(DEFAULT_PANEL_WIDTH);
    expect(extra).toEqual({ somethingNew: true });
    expect(parseState({ leftPanel: "scripts" }).state.leftPanel).toBe("scripts");
    expect(parseState({ activeRepoAuto: false }).state.activeRepoAuto).toBe(false);
    expect(
      parseState({ scriptNodeVersions: { "/a/package.json": "default", "/b/package.json": 18, "/c/package.json": "" } })
        .state.scriptNodeVersions,
    ).toEqual({
      "/a/package.json": "default",
    });
  });

  it("validates the terminal panel height", () => {
    expect(parseState({}).state.terminalHeight).toBe(DEFAULT_TERMINAL_HEIGHT);
    expect(parseState({ terminalHeight: 340 }).state.terminalHeight).toBe(340);
    expect(parseState({ terminalHeight: 10 }).state.terminalHeight).toBe(MIN_TERMINAL_HEIGHT);
    expect(parseState({ terminalHeight: "tall" }).state.terminalHeight).toBe(DEFAULT_TERMINAL_HEIGHT);
    expect(parseState({ terminalHeight: 340 }).extra).toEqual({});
  });

  it("keeps the diff split between 15 and 85 percent", () => {
    expect(parseState({}).state.diffSplitRatio).toBe(0.5);
    expect(parseState({ diffSplitRatio: 0.3 }).state.diffSplitRatio).toBe(0.3);
    expect(parseState({ diffSplitRatio: 0.99 }).state.diffSplitRatio).toBe(0.85);
    expect(parseState({ diffSplitRatio: "wide" }).state.diffSplitRatio).toBe(0.5);
  });

  it("keeps the commit details' height between 80 px and 2000 px", () => {
    expect(parseState({}).state.commitInfoHeight).toBe(DEFAULT_COMMIT_INFO_HEIGHT);
    expect(parseState({ commitInfoHeight: 400 }).state.commitInfoHeight).toBe(400);
    expect(parseState({ commitInfoHeight: 10 }).state.commitInfoHeight).toBe(80);
    expect(parseState({ commitInfoHeight: 400 }).extra).toEqual({});
  });

  it("keeps a saved three-pane split only when every pane keeps its share", () => {
    expect(parseState({}).state.threePaneSplit).toEqual([1 / 3, 2 / 3]);
    expect(parseState({ threePaneSplit: [0.2, 0.6] }).state.threePaneSplit).toEqual([0.2, 0.6]);
    expect(parseState({ threePaneSplit: [0.6, 0.2] }).state.threePaneSplit).toEqual([1 / 3, 2 / 3]);
    expect(parseState({ threePaneSplit: "wide" }).state.threePaneSplit).toEqual([1 / 3, 2 / 3]);
    expect(parseState({}).state.mergeStackHeight).toBe(0);
    expect(parseState({ mergeStackHeight: 420 }).state.mergeStackHeight).toBe(420);
    expect(parseState({}).state.mergeStackRatio).toBe(0.5);
    expect(parseState({ mergeStackRatio: 0.95 }).state.mergeStackRatio).toBe(0.85);
  });

  it("shows both activity bars unless state.json says otherwise", () => {
    expect(parseState({}).state.leftBarVisible).toBe(true);
    expect(parseState({}).state.rightBarVisible).toBe(true);
    expect(parseState({ leftBarVisible: false, rightBarVisible: "no" }).state.leftBarVisible).toBe(false);
    expect(parseState({ rightBarVisible: "no" }).state.rightBarVisible).toBe(true);
    expect(stateToJson(parseState({ leftBarVisible: false }).state, {}).leftBarVisible).toBe(false);
  });

  it("validates the terminal list width", () => {
    expect(parseState({}).state.terminalListWidth).toBe(DEFAULT_TERMINAL_LIST_WIDTH);
    expect(parseState({ terminalListWidth: 260 }).state.terminalListWidth).toBe(260);
    expect(parseState({ terminalListWidth: 20 }).state.terminalListWidth).toBe(MIN_TERMINAL_LIST_WIDTH);
    expect(parseState({ terminalListWidth: "wide" }).state.terminalListWidth).toBe(DEFAULT_TERMINAL_LIST_WIDTH);
    expect(stateToJson(parseState({ terminalListWidth: 260 }).state, {}).terminalListWidth).toBe(260);
  });

  it("validates the Changes tab's file list width and visibility", () => {
    expect(parseState({}).state.changesListWidth).toBe(DEFAULT_CHANGES_LIST_WIDTH);
    expect(parseState({ changesListWidth: 420 }).state.changesListWidth).toBe(420);
    expect(parseState({ changesListWidth: 20 }).state.changesListWidth).toBe(MIN_CHANGES_LIST_WIDTH);
    expect(parseState({ changesListWidth: "wide" }).state.changesListWidth).toBe(DEFAULT_CHANGES_LIST_WIDTH);
    expect(parseState({}).state.changesListVisible).toBe(true);
    expect(parseState({ changesListVisible: "no" }).state.changesListVisible).toBe(true);
    const saved = stateToJson(parseState({ changesListWidth: 420, changesListVisible: false }).state, {});
    expect(saved.changesListWidth).toBe(420);
    expect(saved.changesListVisible).toBe(false);
  });

  it("reads the old recentRepos name", () => {
    expect(parseState({ recentRepos: ["/old"] }).state.recentRepos).toEqual(["/old"]);
  });

  it("notes whether a session was recorded, even an empty one", () => {
    expect(parseState({}).state.sessionRecorded).toBe(false);
    expect(parseState({ lastSession: [] }).state.sessionRecorded).toBe(true);
  });

  it("validates the Markdown preview share", () => {
    expect(parseState({}).state.markdownPreviewRatio).toBe(0.5);
    expect(parseState({ markdownPreviewRatio: 0.3 }).state.markdownPreviewRatio).toBe(0.3);
    expect(parseState({ markdownPreviewRatio: 2 }).state.markdownPreviewRatio).toBe(0.85);
    expect(parseState({ markdownPreviewRatio: 0 }).state.markdownPreviewRatio).toBe(0.15);
    expect(parseState({ markdownPreviewRatio: "wide" }).state.markdownPreviewRatio).toBe(0.5);
    expect(stateToJson(parseState({ markdownPreviewRatio: 0.4 }).state, {}).markdownPreviewRatio).toBe(0.4);
  });

  it("validates the Command Palette's recently used commands", () => {
    expect(parseState({}).state.recentCommands).toEqual([]);
    expect(parseState({ recentCommands: "git.push" }).state.recentCommands).toEqual([]);
    expect(parseState({ recentCommands: ["git.push", 7, "git.push", "view.log"] }).state.recentCommands).toEqual([
      "git.push",
      "view.log",
    ]);
    const many = Array.from({ length: 30 }, (_, index) => `command.${index}`);
    expect(parseState({ recentCommands: many }).state.recentCommands).toHaveLength(20);
    expect(stateToJson(parseState({ recentCommands: ["git.pull"] }).state, {}).recentCommands).toEqual(["git.pull"]);
    // A known key: not kept twice through `extra`.
    expect(parseState({ recentCommands: ["git.pull"] }).extra).toEqual({});
  });

  it("keeps the open tabs of each workspace, validated", () => {
    const openTabs = {
      "/w": {
        tabs: [{ path: "/w/a.ts", preview: false, pinned: true, position: { line: 3, column: 1, topLine: 0 } }],
        active: "/w/a.ts",
      },
      "/bad": { tabs: [{ path: "relative.ts" }] },
    };
    const { state, extra } = parseState({ openTabs });
    expect(state.openTabs).toEqual({ "/w": openTabs["/w"] });
    expect(extra).toEqual({});
    expect(stateToJson(state, {}).openTabs).toEqual({ "/w": openTabs["/w"] });
    expect(parseState({ openTabs: "x" }).state.openTabs).toEqual({});
  });

  it("turns Recent Files on by default and reads it as a boolean", () => {
    expect(defaultPreferences.recentFiles).toBe(true);
    expect(parsePreferences({ recentFiles: false }).preferences.recentFiles).toBe(false);
    expect(parsePreferences({ recentFiles: "no" }).preferences.recentFiles).toBe(true);
  });

  it("keeps the Recent Files of each workspace, validated", () => {
    const recentFileLists = {
      "/w": [{ filePath: "/w/a.ts", edited: true }, { filePath: "relative.ts" }],
      "/empty": [],
    };
    const { state, extra } = parseState({ recentFileLists });
    expect(state.recentFileLists).toEqual({ "/w": [{ filePath: "/w/a.ts", edited: true }] });
    expect(extra).toEqual({});
    expect(stateToJson(state, {}).recentFileLists).toEqual({ "/w": [{ filePath: "/w/a.ts", edited: true }] });
    expect(parseState({ recentFileLists: "x" }).state.recentFileLists).toEqual({});
  });

  it("round-trips through stateToJson", () => {
    const { state, extra } = parseState({
      recentFolders: ["/a"],
      lastSession: [],
      terminalHeight: 300,
      somethingNew: 1,
    });
    const json = stateToJson(state, extra);
    expect(json.somethingNew).toBe(1);
    expect(json.terminalHeight).toBe(300);
    expect(json.lastSession).toEqual([]);
    expect(json).not.toHaveProperty("sessionRecorded");
    expect(parseState(json).state).toEqual(state);
  });
});

describe("writableConfigs", () => {
  it("writes both files when both loaded", () => {
    expect(writableConfigs(noErrors)).toEqual(["state", "settings"]);
  });

  it("never overwrites a file that failed to parse", () => {
    expect(writableConfigs({ settings: "bad json", state: null })).toEqual(["state"]);
    expect(writableConfigs({ settings: null, state: "bad json" })).toEqual(["settings"]);
    expect(writableConfigs({ settings: "bad", state: "bad" })).toEqual([]);
  });
});

describe("shouldMigrateLegacy", () => {
  it("migrates only on a first run without errors", () => {
    expect(shouldMigrateLegacy({ settings: null, state: null }, noErrors)).toBe(true);
    expect(shouldMigrateLegacy({ settings: {}, state: null }, noErrors)).toBe(false);
    // A broken state.json must not be mistaken for a first run.
    expect(shouldMigrateLegacy({ settings: null, state: null }, { settings: null, state: "bad" })).toBe(false);
  });
});

describe("sessionSteps", () => {
  const base = { lastSession: [], lastSessionFile: null, sessionRecorded: true, recentRepos: ["/recent"] };

  it("reopens the workspace file first, then its folders", () => {
    expect(sessionSteps({ ...base, lastSessionFile: "/w.nibtree-workspace", lastSession: ["/a", "/b"] })).toEqual([
      { kind: "workspaceFile", filePath: "/w.nibtree-workspace" },
      { kind: "folders", folderPaths: ["/a", "/b"] },
    ]);
  });

  it("restores the folders open at quit", () => {
    expect(sessionSteps({ ...base, lastSession: ["/a"] })).toEqual([{ kind: "folders", folderPaths: ["/a"] }]);
  });

  it("shows the welcome screen after Close Folder", () => {
    expect(sessionSteps(base)).toEqual([]);
  });

  it("falls back to the most recent folder only for state without a session", () => {
    expect(sessionSteps({ ...base, sessionRecorded: false })).toEqual([{ kind: "folders", folderPaths: ["/recent"] }]);
    expect(sessionSteps({ ...base, sessionRecorded: false, recentRepos: [] })).toEqual([]);
  });
});

describe("changedPreferenceKeys", () => {
  it("compares records by content", () => {
    expect(changedPreferenceKeys({ ...defaultPreferences, mcpTools: {} })).toEqual([]);
    expect(changedPreferenceKeys({ ...defaultPreferences, mcpTools: { git_status: false }, mcpEnabled: true })).toEqual(
      ["mcpEnabled", "mcpTools"],
    );
  });
});

describe("color theme preferences", () => {
  it("default to the built-in Nibtree themes", () => {
    const { preferences } = parsePreferences({});
    expect(preferences.lightColorTheme).toBe("gm-light");
    expect(preferences.darkColorTheme).toBe("gm-dark");
    expect(defaultPreferences.lightColorTheme).toBe("gm-light");
    expect(defaultPreferences.darkColorTheme).toBe("gm-dark");
  });

  it("keep known themes of the right mode", () => {
    const { preferences } = parsePreferences({
      lightColorTheme: "solarized-light",
      darkColorTheme: "high-contrast-dark",
    });
    expect(preferences.lightColorTheme).toBe("solarized-light");
    expect(preferences.darkColorTheme).toBe("high-contrast-dark");
  });

  it("fall back to the defaults for unknown ids, wrong types and themes of the other mode", () => {
    expect(parsePreferences({ lightColorTheme: "no-such-theme" }).preferences.lightColorTheme).toBe("gm-light");
    expect(parsePreferences({ darkColorTheme: 7 }).preferences.darkColorTheme).toBe("gm-dark");
    expect(parsePreferences({ lightColorTheme: "dracula" }).preferences.lightColorTheme).toBe("gm-light");
    expect(parsePreferences({ darkColorTheme: "github-light-high-contrast" }).preferences.darkColorTheme).toBe(
      "gm-dark",
    );
  });

  it("are known keys, not extras", () => {
    expect(parsePreferences({ lightColorTheme: "nord" }).extra).toEqual({});
  });

  it("show up as changed only when not the default", () => {
    expect(changedPreferenceKeys(defaultPreferences)).toEqual([]);
    expect(changedPreferenceKeys({ ...defaultPreferences, darkColorTheme: "nord" })).toEqual(["darkColorTheme"]);
  });
});

describe("commit message settings", () => {
  it("defaults to history and the subject guide on, with no templates", () => {
    const { preferences } = parsePreferences({});
    expect([preferences.commitMessageHistory, preferences.commitSubjectGuide, preferences.commitTemplates]).toEqual([
      true,
      true,
      [],
    ]);
    expect(changedPreferenceKeys(preferences)).toEqual([]);
  });

  it("validates the switches and templates", () => {
    const { preferences, extra } = parsePreferences({
      commitMessageHistory: false,
      commitSubjectGuide: "yes",
      commitTemplates: [
        { name: "Feature", text: "feat:[{ticket}] " },
        { name: "", text: "dropped" },
      ],
    });
    expect(preferences.commitMessageHistory).toBe(false);
    expect(preferences.commitSubjectGuide).toBe(true);
    expect(preferences.commitTemplates).toEqual([{ name: "Feature", text: "feat:[{ticket}] " }]);
    expect(extra).toEqual({});
    expect(changedPreferenceKeys(preferences)).toEqual(["commitMessageHistory", "commitTemplates"]);
  });

  it("keeps the message history in state.json, validated", () => {
    expect(parseState({}).state.commitMessages).toEqual({});
    const { state, extra } = parseState({
      commitMessages: { "/repo": [{ message: "wip: typed", time: 5 }, { message: 1 }] },
    });
    expect(state.commitMessages).toEqual({ "/repo": [{ message: "wip: typed", time: 5 }] });
    expect(extra).toEqual({});
    expect(parseState(stateToJson(state, extra)).state.commitMessages).toEqual(state.commitMessages);
    expect(parseState({ commitMessages: "broken" }).state.commitMessages).toEqual({});
  });
});

describe("keybindings", () => {
  it("keeps custom keys for known commands and drops the rest", () => {
    expect(parsePreferences({}).preferences.keybindings).toEqual({});
    expect(
      parsePreferences({
        keybindings: { "git.push": "F5", "view.sidebar": null, "made.up": "F6", "git.pull": "Nope+P" },
      }).preferences.keybindings,
    ).toEqual({ "git.push": "F5", "view.sidebar": null });
    expect(parsePreferences({ keybindings: "F5" }).preferences.keybindings).toEqual({});
  });

  it("counts custom keys as a changed preference", () => {
    expect(changedPreferenceKeys({ ...defaultPreferences, keybindings: { "git.push": "F5" } })).toEqual([
      "keybindings",
    ]);
  });
});

describe("split editor settings", () => {
  it("splits by default and validates the switch", () => {
    expect(defaultPreferences.splitEditor).toBe(true);
    expect(parsePreferences({ splitEditor: false }).preferences.splitEditor).toBe(false);
    expect(parsePreferences({ splitEditor: "off" }).preferences.splitEditor).toBe(true);
  });

  it("scrolls the tabs by default and validates the wrap switch", () => {
    expect(defaultPreferences.wrapTabs).toBe(false);
    expect(parsePreferences({ wrapTabs: true }).preferences.wrapTabs).toBe(true);
    expect(parsePreferences({ wrapTabs: "yes" }).preferences.wrapTabs).toBe(false);
  });

  it("shows a lone tab as a title by default and validates the switch", () => {
    expect(defaultPreferences.singleTabTitle).toBe(true);
    expect(parsePreferences({ singleTabTitle: false }).preferences.singleTabTitle).toBe(false);
    expect(parsePreferences({ singleTabTitle: "no" }).preferences.singleTabTitle).toBe(true);
  });
});

describe("auto fetch preferences", () => {
  it("fetches every 10 minutes by default", () => {
    expect(defaultPreferences.autoFetch).toBe(true);
    expect(defaultPreferences.autoFetchIntervalMinutes).toBe(10);
  });

  it("keeps valid values and clamps or drops the rest", () => {
    expect(parsePreferences({ autoFetch: false, autoFetchIntervalMinutes: 30 }).preferences).toMatchObject({
      autoFetch: false,
      autoFetchIntervalMinutes: 30,
    });
    expect(parsePreferences({ autoFetchIntervalMinutes: 0 }).preferences.autoFetchIntervalMinutes).toBe(1);
    expect(parsePreferences({ autoFetchIntervalMinutes: 5000 }).preferences.autoFetchIntervalMinutes).toBe(1440);
    expect(parsePreferences({ autoFetchIntervalMinutes: 2.6 }).preferences.autoFetchIntervalMinutes).toBe(3);
    expect(parsePreferences({ autoFetch: "yes", autoFetchIntervalMinutes: "5" }).preferences).toMatchObject({
      autoFetch: true,
      autoFetchIntervalMinutes: 10,
    });
  });
});

describe("window settings", () => {
  it("reopens windows on start unless turned off", () => {
    expect(defaultPreferences.reopenWindows).toBe(true);
    expect(parsePreferences({ reopenWindows: false }).preferences.reopenWindows).toBe(false);
    expect(parsePreferences({ reopenWindows: "no" }).preferences.reopenWindows).toBe(true);
  });

  it("keeps each window's layout keys among the keys state.json holds", () => {
    const written = stateToJson(parseState({}).state, {});
    for (const key of WINDOW_STATE_KEYS.filter((key) => key !== "windows")) {
      expect(written).toHaveProperty(key);
    }
    // Shared lists are not per window: a recent folder opened in one window shows in all.
    expect(WINDOW_STATE_KEYS).not.toContain("recentFolders");
    expect(WINDOW_STATE_KEYS).not.toContain("openTabs");
  });

  it("leaves the backend's window session alone", () => {
    const windows = [{ folders: ["/a"], workspaceFile: null, bounds: null }];
    const { state, extra } = parseState({ windows, lastSession: ["/a"] });
    expect(stateToJson(state, extra).windows).toEqual(windows);
  });
});
