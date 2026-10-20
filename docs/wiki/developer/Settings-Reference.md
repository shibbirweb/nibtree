# Settings Reference

Every key in `~/.nibtree/settings.json` and `state.json`, with its default, what `parsePreferences` or `parseState` accepts (in `src/lib/stores/settingsData.ts`), and where it is used. How loading and saving work is in [How Settings Work](How-Settings-Work.md); the user side is in [Settings](../usage/Settings.md) and [Settings Files](../usage/Settings-Files.md).

Validators: `pickBoolean` (a boolean, else the default), `pickNumber` (a finite number, clamped), `pickInteger` (rounded, then clamped), `pickTenths` (rounded to 0.1, then clamped), `pickOneOf` (one of a list), `pickThemeId` (a known theme of the right mode).

## settings.json

### Appearance

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `theme` | `"system"` | `system`, `light`, `dark` | `applyAppearance`, `colorMode` |
| `roundedPanels` | true | boolean | `data-rounded-panels` |
| `projectColorHeader` | true | boolean | `views/Header.svelte`: `AppHeader`'s `tint` |
| `fileToolbar` | `"top"` | `top`, `bottom`, `none` | `FileView`, `EmptyMain`, `navBar/` |
| `fileToolbarBreadcrumbs`, `fileToolbarBadges`, `fileToolbarChanges`, `fileToolbarBlame`, `fileToolbarCopyPath`, `fileToolbarMarkdownView`, `fileToolbarMarkdownFormat` | true | boolean | `views/files/fileToolbar.ts` |
| `uiFontSize` | 13 | 11 to 16 | `--ui-size` |
| `fileIcons` | `"off"` | `off`, `minimal`, `material` | `fileIcons/fileIcons.svelte.ts`, View > File Icons |

### Editor

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `lightColorTheme` | `"gm-light"` | a light theme id | `themes/apply.ts` |
| `darkColorTheme` | `"gm-dark"` | a dark theme id | `themes/apply.ts` |
| `editorFontFamily` | `DEFAULT_EDITOR_FONT` (`'JetBrains Mono', Menlo, Monaco, 'Cascadia Mono', Consolas, 'Courier New', monospace`) | `normalizeFontFamily` (drops repeats); the earlier default without the Windows fonts loads as this one | `--font-mono` |
| `editorFontSize` | 13 | 10 to 20 | `--code-size`, View > Zoom |
| `editorFontWeight` | 400 | 100 to 900, rounded to 100 | `--code-weight` |
| `editorLineHeight` | 1.25 | 1 to 2.5, rounded to 0.05 | `--code-line-height` |
| `mouseWheelZoom` | false | boolean | `App.svelte`, `editor/wheelZoom.ts` |
| `fontLigatures` | false | boolean | `data-ligatures` |
| `syntaxHighlighting` | true | boolean | `App.svelte`, `editor/languages.ts`, `MarkdownPreview.svelte` |
| `tabSize` | 4 | 2, 4, 8 (`TAB_SIZES`) | `App.svelte`, `editor/indentation.ts` |
| `detectIndentation` | true | boolean | `App.svelte`, `editor/indentation.ts`, View > Detect Indentation |
| `renderWhitespace` | `"selection"` | `RENDER_WHITESPACE_CHOICES` | `App.svelte`, `editor/whitespace.ts` |
| `unloadHiddenTabs` | true | boolean | `App.svelte`, `repoStore.sleepHiddenTabs` |
| `unloadHiddenTabsMinutes` | 15 | 5, 15, 30, 60 (`UNLOAD_TAB_MINUTES`) | `stores/tabSleep.ts` |
| `editorCursorStyle` | `"line"` | `EDITOR_CURSOR_STYLE_CHOICES` | `App.svelte`, `editor/cursor.ts` |
| `editorCursorWidth` | 2 | `pickInteger`, 1 to 6 (`EDITOR_CURSOR_WIDTH_RANGE`) | `editor/cursor.ts` |
| `editorCursorBlinking` | `"blink"` | `EDITOR_CURSOR_BLINKING_CHOICES` | `editor/cursor.ts` |
| `editorCursorSmoothCaret` | false | `pickBoolean` | `editor/cursor.ts` |
| `editorCaretExtraTop`, `editorCaretExtraBottom` | 0 | `pickInteger`, 0 to 10 (`CARET_EXTRA_RANGE`) | `editor/cursor.ts` |
| `editorAutoCloseBrackets` | true | `pickBoolean` | `editor/features.ts` (file editor) |
| `editorCompletion` | true | `pickBoolean` | `editor/features.ts` (file editor) |
| `editorCompletionOnTyping` | true | `pickBoolean` | `editor/features.ts`; off, only Ctrl+Space opens the list |
| `editorFoldGutter` | true | `pickBoolean` | `editor/features.ts` (file editor) |
| `editorIndentGuides` | true | `pickBoolean` | `editor/indentGuides.ts` (all panes) |
| `editorHighlightWord` | true | `pickBoolean` | `editor/features.ts` (all panes) |
| `editorScrollPastEnd` | true | `pickBoolean` | `editor/features.ts` (file editor) |
| `editorColumnSelection` | true | `pickBoolean` | `editor/features.ts` (all panes) |
| `editorRulerColumn` | 0 (off) | `pickRulerColumn`: whole, 1 to 500 (`EDITOR_RULER_RANGE`), else 0 | `editor/ruler.ts` (all panes) |
| `wordWrap` | false | boolean | `FileView.svelte`, `App.svelte`, `editor/wordWrap.ts`, View > Word Wrap |
| `markdownViewMode` | `"split"` | `editor`, `split`, `preview` | `FileView.svelte` (`sessionViewMode`) |
| `currentLineBlame` | true | boolean | `FileView.svelte`, `DiffView.svelte` |
| `blameGutter` | false | boolean | `editor/blame.ts`, Blame buttons |

### Git

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `diffLayout` | `"sideBySide"` | `"sideBySide"`, `"aligned"` or `"inline"` | `diff/DiffView.svelte` |
| `commitBoxLayout` | `"single"` | `"single"` or `"perRepo"` | `ChangesView.svelte`, `changes/RepoSection.svelte`, `git/ChangesTab.svelte` |
| `ignoreWhitespace` | false | boolean | `merge/MergeEditor.svelte` |
| `logAllRefs` | true | boolean | `views/LogView.svelte` |
| `commitSignOff` | false | boolean | `views/changes/commitOptions.svelte.ts` |
| `commitGpgSign` | `"default"` | `default`, `sign`, `noSign` | `views/changes/commitOptions.svelte.ts` |
| `gitConsole` | false | boolean | `App.svelte` (`gitConsoleSetEnabled`), terminal panel |
| `updateMethod` | `"merge"` | `merge`, `rebase` | `views/git/UpdateProjectDialog.svelte`, `gitMenuActions.ts` |

`updateMethod` has no row in the dialog: Update Project saves its last choice.

### Terminal

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `terminalShell` | null | a trimmed path up to 1024 characters, else null | `terminalStore.svelte.ts` |
| `terminalFontFamily` | `""` | `normalizeTerminalFontFamily` (empty means the editor font) | `terminal/options.ts`, `fonts.ts` |
| `terminalFontSize` | 13 | 9 to 24 | `terminal/options.ts` |
| `terminalLineHeight` | 1.2 | 1 to 2, tenths | `terminal/options.ts` |
| `terminalLetterSpacing` | 0 | 0 to 5, whole | `terminal/options.ts` |
| `terminalFontWeight` | `"normal"` | `normal`, `medium`, `bold` | `terminal/options.ts` |
| `terminalFontWeightBold` | `"bold"` | same | `terminal/options.ts` |
| `terminalLigatures` | false | boolean | `TerminalView.svelte`, `terminalAddonPlan` (no WebGL with ligatures) |
| `terminalNerdFontIcons` | true | boolean | `terminal/options.ts` |
| `terminalCursorStyle` | `"block"` | `block`, `bar`, `underline` | `terminal/options.ts` |
| `terminalCursorBlink` | true | boolean | `terminal/options.ts` |
| `terminalScrollback` | 5000 | 1000 to 100000, whole (`clampTerminalScrollback`) | `terminal/options.ts` |
| `terminalCopyOnSelect` | false | boolean | `terminalActions.ts` (`CopyOnSelect`) |
| `terminalFind` | true | boolean | `terminalAddonPlan`, `keys.ts` (Cmd+F) |
| `terminalFileLinks` | true | boolean | `terminalAddonPlan`, `TerminalView.svelte` |
| `terminalGpuAcceleration` | true | boolean | `terminalAddonPlan`, `addons.ts` |
| `terminalUnicode11` | true | boolean | `terminalAddonPlan`, `addons.ts` |
| `terminalOptionAsMeta` | false | boolean | `terminal/options.ts` (`macOptionIsMeta`) |
| `terminalVisualBell` | true | boolean | `terminalController.svelte.ts` |
| `terminalSmoothScrolling` | false | boolean | `terminal/options.ts` (`smoothScrollDuration` 125 ms) |
| `terminalDropPaths` | true | boolean | `TerminalHost.svelte` |

The two defaults changed from 12.5 and 1 to 13 and 1.2. Saved values are read as they are, so only people who never saved settings see the new ones. What each switch loads is in [How terminal features work](How-Terminal-Features-Work.md).

### Automation

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `mcpEnabled` | false | boolean | `App.svelte`, `mcpStore.configure` |
| `cliEnabled` | false | boolean | same |
| `mcpPort` | 48731 | a whole number 1024 to 65535 (`parseMcpPort`) | same |
| `mcpTools` | `{}` | tool names (`^[a-z][a-z0-9_]{0,63}$`) to booleans, at most 300 (`pickToolStates`) | same |
| `memoryLogEnabled` | false | boolean | `App.svelte`, `memoryLog.configure` |
| `memoryLogIntervalMs` | 500 | 100 to 10000, whole | same |
| `memoryLogThresholdMb` | 5 | 0 to 500 | same |

The MCP server and the memory log are driven only by the main window, never by a `git mergetool` window, which would compete for the port.

### Layout

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `confirmDragAndDrop` | true | boolean | `views/files/explorerOps.ts` (`move`) |

The other Layout choices are in `state.json`, below.

### Updates

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `checkForUpdates` | true | boolean | `update/updates.svelte.ts` |
| `updateChannel` | `"auto"` | `auto`, `stable`, `beta` | `update/updates.svelte.ts` |

## state.json

| Key | Default | Accepted | Used by |
| --- | --- | --- | --- |
| `recentFolders` | `[]` | strings, at most 12 (older files: `recentRepos`) | welcome screen, File > Open Recent |
| `recentWorkspaces` | `[]` | lists of two or more folders, at most 12 | same |
| `recentWorkspaceFiles` | `[]` | strings, at most 12 | same |
| `lastSession`, `lastSessionFile` | `[]`, null | strings | `sessionSteps` |
| `lastRunVersion`, `skippedVersion` | null | strings | What's New, update check |
| `activeRepos` | `{}` | folder to repository root | `stores/repo.svelte.ts` |
| `activeRepoAuto` | true | boolean | Status bar repository picker (`views/repoSelection.svelte.ts`) |
| `scriptNodeVersions` | `{}` | `package.json` path to a bin folder or `"default"`, the newest 200 | Scripts panel |
| `explorerOpen` | true | boolean | Files panel |
| `leftBarVisible`, `rightBarVisible` | true | boolean | `Workspace.svelte`, `Header.svelte`, View menu |
| `leftPanel` | `"changes"` | `changes`, `branches`, `scripts` or null | left sidebar |
| `sidebarWidth`, `explorerWidth` | 260 | 120 to 2000 | side panels |
| `commitInfoHeight` | 260 | 80 to 2000 | `log/CommitDetails.svelte`: the message and details above the changed files |
| `terminalHeight` | 260 | 80 to 2000 | terminal panel |
| `terminalListWidth` | 180 | 120 to 1200 | terminal list |
| `changesListWidth` | 320 | 160 to 2000 | Changes tab file list |
| `changesListVisible` | true | true or false | Changes tab file list shown |
| `diffSplitRatio` | 0.5 | 0.15 to 0.85 | `diff/DiffView.svelte` |
| `threePaneSplit` | [1/3, 2/3] | each pane 0.15 or more | `diff/ThreePaneDiff.svelte`, `merge/MergeEditor.svelte` |
| `markdownPreviewRatio` | 0.5 | 0.15 to 0.85 | `FileView.svelte` |

`stateToJson` writes these keys and keeps any others it found. Unknown keys of either file are kept, so a newer version's keys survive an older app.

## Keeping this page in sync

- A new preference goes in `Preferences`, `defaultPreferences`, `parsePreferences`, the store's field and `preferences()`, then in this page, [Settings](../usage/Settings.md) and [Settings Files](../usage/Settings-Files.md). Its row in the dialog needs an entry in `SETTINGS_SEARCH_INDEX` ([How search in Settings works](How-Settings-Search-Works.md)).
- A new state key goes in `UiState`, `STATE_KEYS`, `parseState`, `stateToJson` and the store's `uiState()`.
- `settingsData.test.ts` should cover its validation.
