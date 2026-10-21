# Test Suites

This is the list of what the tests cover, folder by folder. How to run them, the helpers and the rules are on [Testing](Testing.md). On 2 October 2026 the Vitest suites held 934 tests in 96 files and the Rust code had 424 `#[test]` functions for `cargo test`; the numbers grow with every feature, so treat them as a rough size, not a target.

## Vitest suites (`bun run test`)

Files are `<name>.test.ts` next to the module they test. Folders are under `src/lib/` unless shown otherwise.

| Folder | Test files | What they cover |
| --- | --- | --- |
| `merge/` | `model`, `inline`, `extensions` | line replacement and chunk actions, word highlights, the Cmd+Enter keymap |
| `editor/` | `lineDiff`, `conflictMarkers`, `blameModel`, `navigation`, `wheelZoom`, `languageName`, `findModel`, `textCommands`, `editorShortcuts`, `whitespace`, `activeLine`, `selectionInfo`, `featurePlan`, `indentGuides`, `ruler` | change markers, conflict markers, blame mapping, next change, zoom, language names and grammars, the find bar's options and counter, Duplicate, Join Lines, Sort Lines and Go to Line, menu keys, Render whitespace, the current-line highlight, selection counts, which editor features apply where, indent guides, the margin line |
| `diff/` | `split`, `binaryPreview` | the resizable split ratio and its limits, the side by side image and PDF preview: sides, shared zoom and scroll |
| `log/` | `graph`, `lineMatch` | graph lanes and merges, finding the blamed line |
| `stores/` | `tabs`, `navHistory`, `workspacePaths`, `fontFamily`, `commitTabs`, `gitTabs`, `branchTabs`, `settingsData`, `openingProgress` | preview tabs, Back and Forward, path helpers, font lists, pseudo tab paths, settings validation and migration, the opening progress text |
| `menu/` | `menuSpec`, `menuState` | ids, accelerators and per-platform layout of the menu bar; enabled, checked and renamed items |
| `help/` | `shortcuts` | the Keyboard Shortcuts window lists every menu key plus the others |
| `terminal/` | `terminals`, `terminalTabs`, `runs`, `keys`, `fonts`, `options`, `theme`, `find`, `fileLinks`, `splitPanes`, `dropPaths` | naming and the active terminal after a close, terminals in editor tabs, script runs, key handling, fonts, xterm options and the addon plan, terminal colors, find, clickable file paths, split groups and pane sizes, dropped paths |
| `scripts/` | `scriptsModel`, `scriptRun`, `nodeVersion` | the Scripts tree, the run command, Node version ranges and LTS names |
| `search/` | `doubleShift`, `searchTabs`, `popupRows`, `fileSearchModel`, `symbolSearchModel`, `textSearchModel`, `replaceModel` | double Shift, the popup tabs and rows, result models, Replace in Files |
| `markdown/` | `render`, `format`, `links`, `highlight`, `scrollSync`, `richSync`, `slug`, `viewMode` | rendering, toolbar formatting, links and images, code highlight, scroll sync, rich editor write back, heading ids, view modes |
| `themes/` | `apply`, `appCss` (`catalog`, `themeIndex` and `color` are in the UI library) | every theme's tokens and WCAG contrast, color math, the theme list, applying a theme |
| `console/` | `consoleModel` | merging Git Console entries, the filter and the rows |
| `shelf/` | `shelfModel` | the Shelf list |
| `ignore/` | `gitignore` | escaped patterns for files and folders |
| `mcp/` | `toolDefs`, `toolStates`, `args`, `connect`, `menuCommands`, `perfModel` | UI tool definitions, tool switches, argument checks, connect commands, menu tools, performance sampling |
| `debug/` | `memoryEvents` | naming the scroll areas for the memory log |
| `update/` | `releases`, `update` | channels, the safe Markdown renderer, issue links, changelog parsing and semver |
| `views/` | `workspaceShortcuts`, `recentEntries` | window shortcuts, Open Recent entries |
| `views/changes/` | `commitFields`, `sections`, `drafts`, `fileStatus`, `repoMenu`, `repoPickers`, `sync`, `commitOptions` | grouping and selection, drafts, row ids, the repository ... menu and pickers, Sync Changes, commit options |
| `views/files/` | `tones`, `reveal`, `locate`, `mediaPreview`, `previewSource`, `selection`, `fileOps`, `fileNames`, `dragDrop` | status colors, revealing and locating a file, previews and their `gmpreview` URLs, multi-select, file operation menus and keys, names, drag and drop |
| `views/git/` | `branchPopup`, `gitOptions`, `integrateOptions`, `rebaseModel`, `github`, `lfs/lfsModel`, `submodules/submoduleModel`, `worktrees/worktreeModel` | Branches popup, dialog options, Merge and Rebase options, the interactive rebase list, GitHub links, LFS, submodules, worktrees |
| `views/github/` | `githubModel` | GitHub dialogs and results |
| `browser/` | `pageClipboard`, `pathPickerModel`, `protocol`, `tabs` | the browser version's clipboard, path picker, socket messages and tabs |
| `scripts/` (repository root) | `versioning`, `debPackage`, `wiki` | version and changelog tools, the wiki checks |

## Rust tests (`cargo test`)

Most modules test themselves in a `#[cfg(test)]` block; the bigger ones have a `tests.rs` beside them.

| Module | What the tests cover |
| --- | --- |
| `commands/tests.rs` | whole commands against real repositories: staging, commits, conflicts, mergetool, file operations and `files_exist` |
| `commands/*.rs` | branch actions, commit options, history, ignore files, Merge and Rebase options, patches, interactive rebase (with merges), remotes, clone and cancel, shelf, stash, status, tags, config |
| `git/tests.rs` and `git/*.rs` | readers and the CLI runner, the demo script, blame, cancel, files, LFS, submodules, worktrees |
| `merge/engine.rs` | the 3-way engine and its oracle test against `git merge-file` |
| `watcher.rs` | attribution, ignored paths, linked git folders, index invalidation |
| `terminal.rs`, `run_process.rs` | shells, PTYs, hang up and kill, script runs and the login environment |
| `scripts/`, `node_versions.rs` | each script file format, the wanted Node version, installed versions |
| `file_search.rs`, `symbols/`, `text_search/` | indexing, matching, caps, cancel, the symbol scanners, Replace in Files |
| `git_console.rs` | recording, masking secrets, limits, off means nothing |
| `shelf/` | patch sections and the store |
| `github/tests.rs` | every GitHub path against a fake network, keychain and gh |
| `mcp/tests.rs` and `mcp/*.rs` | the server over real HTTP, tokens, paths, the tool registry, install, the CLI client |
| `mcp/tests/git_tools/` | every git tool end to end on real repositories: changes and commits, branches, tags, stashes, history rewrites, conflicts, continue and abort |
| `preview_scheme/tests.rs` | the `gmpreview` scheme: URL decoding, ranges, the folder check, work tree files and revisions of real repositories |
| `memory.rs`, `memory_log.rs`, `images.rs`, `media.rs`, `config.rs`, `state.rs`, `workspace_file.rs` | the smaller modules |

The Git menu UI tests (`scripts/ui-test.ts`) click every Git menu item in the page and check the result with git; see [Git Menu UI Tests](Git-Menu-UI-Tests.md).

When you add a test file, add it to this page in the same commit.
