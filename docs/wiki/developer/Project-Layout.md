# Project Layout

This is a map of the repository. It lists the folders and files you will touch most, with one line each. Build output (`node_modules`, `build`, `.svelte-kit`, `src-tauri/target`, `src-tauri/gen`) is left out, and it is never committed.

## The top level

```text
.
├── src/                    Svelte 5 + TypeScript UI
├── src-tauri/              Rust backend (Tauri 2)
├── scripts/                demo repositories, version and wiki tools
├── ui/                     the UI libraries (ui/web, ui/swift) and the tokens for every platform (ui/design-tokens)
├── docs/wiki/              source of the GitHub wiki (this page lives here)
├── static/                 files served as they are (favicon.png, file-icons/ sets)
├── .github/                workflows, issue forms, pull request template
├── .vscode/                recommended extensions (Svelte, Tauri, rust-analyzer) and settings
├── .gitignore              keeps node_modules, build and .svelte-kit out of git
├── CHANGELOG.md            release notes and What's New (Keep a Changelog)
├── CLAUDE.md               the project rules in one page
├── README.md               overview, build and release summary
├── package.json            Bun scripts and JS dependencies (version mirror)
├── bun.lock                locked JS dependencies (always committed)
├── vite.config.js          Vite, Vitest, prebundled lazy libraries and the dev-only IPC bridge plugin
├── svelte.config.js        adapter-static with an index.html fallback (SPA)
└── tsconfig.json           strict TypeScript
```

## The UI: `src/`

```text
src/
├── app.html                the HTML shell
├── hooks.client.ts         starts the dev IPC bridge in dev builds only
├── routes/                 +layout.ts (ssr = false), +layout.svelte, +page.svelte
└── lib/
    ├── App.svelte          the shell: Welcome, Workspace or the mergetool window
    ├── api.ts              one typed wrapper per Tauri command, plus event listeners
    ├── types.ts            TypeScript mirrors of the Rust DTOs (camelCase)
    ├── ai/                 the AI panel: projects, worktrees, agent tabs and their status
    ├── stores/             app state: repo, settings, tabs, navigation, paths
    │   ├── pseudoTabs.ts   tabs that are not files: commits, Git views, branches, terminals
    │   ├── commitTabs.ts, gitTabs.ts, branchTabs.ts   pseudo tab paths for each kind
    │   ├── fileCommands.svelte.ts   Save, Revert and Markdown mode of the open editors
    │   ├── openingProgress.ts       text of the folder opening card and status counter
    │   └── settingsData.ts pure settings validation, what may be saved, session steps
    ├── views/              the main window: header, activity bars, sidebars, Changes, Log, Files, Settings
    │   ├── workspaceShortcuts.ts, workspaceActions.ts   which key means what, and what it does
    │   ├── gitActions.ts   fetch, pull, push, stash, sync, tags, shared by the Git menu and Changes
    │   ├── changes/        Changes sidebar: sections, repository actions row, commit box, Sync, drafts
    │   ├── files/          Files panel, the file editor, Markdown preview and rich editor
    │   ├── git/            Git menu actions and dialogs, Branches popup, history and compare tabs
    │   │   └── worktrees/, submodules/, lfs/   their dialogs, models and actions
    │   ├── github/         GitHub sign in, Share Project, Create Gist
    │   ├── settings/       the color theme picker
    │   └── sidebar/        branches, tags and stashes tree and its actions
    ├── menu/               native menu bar: menuSpec.ts (data), menuState.ts, appMenu.svelte.ts, menuActions.ts
    ├── help/               Help > Keyboard Shortcuts (built from menuSpec)
    ├── terminal/           integrated terminal, bottom panel, Run tab, xterm glue (lazy)
    ├── scripts/            Scripts tool window and Node version matching
    ├── search/             Search Everywhere popup: files, classes, symbols, text, Replace in Files
    ├── markdown/           Markdown preview, sanitizing, mermaid, rich editor (lazy)
    ├── themes/             applying and watching color themes (the themes are in the UI library)
    ├── console/            Git Console list (lazy, only while its setting is on)
    ├── shelf/              Shelf panel, Shelve dialog, shelved diff tab
    ├── ignore/             Add to .gitignore patterns and submenu
    ├── mcp/                UI side of the MCP server: tool definitions, bridge, handlers
    ├── debug/              UI events for the debug memory log
    ├── merge/              3-way merge tool: model.ts, extensions.ts, MergeEditor.svelte
    ├── diff/               2-way diff view on @codemirror/merge, resizable split (split.ts), binary preview
    ├── editor/             CodeMirror setup, blame, conflict and change markers, find bar, editor commands
    ├── log/                commit graph layout (graph.ts), commit details, CommitTab, lineMatch.ts
    ├── update/             update check, changelog parser, What's New
    ├── ui/                 dialogs, pick list, toasts, context menu, icons, resize handle
    └── dev/ipcBridge.ts    dev-only relay used by the screenshot script
```

Pure logic lives in plain `.ts` files next to the component that uses it, with a `*.test.ts` beside it. Files named `*.svelte.ts` use runes (`$state`) and hold shared state. What each feature folder does is on [Frontend Modules](Frontend-Modules.md).

## The backend: `src-tauri/`

```text
src-tauri/
├── Cargo.toml              the version (source of truth), dependencies, release profile, workspace
├── Cargo.lock              locked Rust dependencies (always committed)
├── cli/                    nibtree-cli: the command line tool, and Windows' console program
├── tauri.conf.json         window, CSP, bundle settings (no version of its own)
├── tauri.windows.conf.json the Windows installer (NSIS)
├── tauri.windows-release.conf.json   adds the console program to Windows release builds
├── capabilities/default.json   what the main window may call
├── build.rs                tauri_build::build()
├── .gitignore              keeps target/ and gen/schemas out of git
├── icons/                  app icons
└── src/
    ├── main.rs             calls nibtree_lib::run()
    ├── lib.rs              plugins, AppState, the registered commands, `nibtree cli`
    ├── state.rs            AppState and LaunchMode (app or mergetool)
    ├── error.rs            AppError, serialized as { kind, message }
    ├── commands/           Tauri commands by area: workspace, repo, status, merge, branch,
    │                       branch_actions, integrate, rebase, remote, patch, tag, history, stash,
    │                       shelf, ignore, worktree, submodule, lfs, files, search, scripts,
    │                       terminal, console, mcp, config, ai
    │   ├── mod.rs          blocking(), OpOutcome, safe_join(), with_paths(), reject_option()
    │   ├── commit_options.rs   sign-off, author, GPG and skip hooks as git commit arguments
    │   ├── rebase_merges.rs    interactive rebase todo that keeps merge commits
    │   └── tests.rs        command tests against real repositories
    ├── git/                git2 readers and the git CLI runner
    │   ├── mod.rs          the module list
    │   ├── repo.rs         open() one work tree, discover() the repository around a path
    │   ├── cli.rs          runs your git binary with a safe environment
    │   ├── cancel.rs       long commands that can be stopped (clone)
    │   ├── status.rs, diff.rs, log.rs, refs.rs, stash.rs, blame.rs, files.rs
    │   ├── history.rs      file and line history through git log
    │   ├── worktree.rs, submodule.rs, lfs.rs
    │   ├── conflicts.rs    conflict sides and mergetool paths
    │   ├── opstate.rs      detects a merge, rebase, cherry-pick or revert in progress
    │   ├── workspace.rs    finds repositories inside a folder (bounded scan)
    │   └── tests.rs        git integration tests, including the demo script
    ├── merge/              mod.rs, engine.rs (3-way chunking with imara-diff), model.rs (DTOs)
    ├── terminal.rs         shells in pseudo terminals
    ├── run_process.rs      script runs without a shell, with the login shell environment
    ├── scripts/            package.json, composer.json, Makefile, deno.json, justfile, wanted Node
    ├── node_versions.rs    installed Node versions from version managers
    ├── file_search.rs      Go to File index (ignore + nucleo-matcher)
    ├── symbols/            Classes and Symbols index and the per-language scanners
    ├── text_search.rs      Find in Files (grep-searcher)
    ├── text_search/replace.rs   Replace in Files
    ├── git_console.rs      the Git Console's record of git commands
    ├── shelf/              shelved changes as patches in the git folder
    ├── github/             GitHub account, REST client, keychain, gh CLI
    ├── mcp/                MCP server, its tools and the UI bridge (mcp::cli is the cli/ crate)
    ├── memory_log.rs       debug memory log in ~/.nibtree/logs
    ├── images.rs           local images for the Markdown preview as data URLs
    ├── media.rs            image and PDF types and size limits for the previews
    ├── preview_scheme.rs   the gmpreview URL scheme that streams previews to the web view
    ├── watcher.rs          debounced file watching, repo-changed and workspace-changed
    ├── config.rs           ~/.nibtree/settings.json and state.json, atomic writes
    ├── workspace_file.rs   .nibtree-workspace and .code-workspace files
    ├── memory.rs           memory readout for the status bar (macOS)
    ├── terminal_memory.rs  each terminal's memory: its shell and what it started
    └── test_support.rs     temporary repositories with an isolated git config
```

## Scripts: `scripts/`

```text
scripts/
├── make-conflict-repo.sh   repo stopped in a merge or rebase with every conflict type
├── make-workspace-demo.sh  folder with nested, conflicted and clean repositories
├── make-docs-demo.sh       the workspace used for wiki screenshots
├── version.ts              show, check, set, notes, pending, bump, untried, next-ticket
├── versioning.ts           pure helpers behind version.ts (tested)
├── versioning.test.ts      tests for versioning.ts
├── build-wiki.ts           checks docs/wiki (--check) or writes the wiki pages to a folder
├── wiki.ts                 pure helpers behind build-wiki.ts, including MAX_WORDS
├── wiki.test.ts            tests for wiki.ts
├── file-icons.ts           writes and checks static/file-icons (Minimal and Material sets)
└── screenshots.ts          retakes the wiki screenshots through the dev IPC bridge
```

The shell scripts refuse a folder that is not empty. `version.ts` is explained in [Versioning and Changelog](Versioning-and-Changelog.md), the wiki and screenshot scripts in [Docs and Screenshots](Docs-and-Screenshots.md).

## UI library: `ui/`

```text
ui/
├── web/                    the Svelte component library: `bun run ui` shows it at http://localhost:1430
│   ├── src/lib/components/ one component per file; no class or style props
│   ├── src/lib/logic/      pure, tested logic (keys, trees, virtual rows, menus, resizing)
│   ├── src/lib/docs/       one doc per component: the showcase and the AI pages come from it
│   ├── src/showcase/       the local site: stories, props, code tabs, colors and sizes
│   └── COMPONENTS.md       the generated index for AI agents (docs/components/<Name>.md per component)
├── swift/                  the SwiftUI twin of ui/web: `bun run ui:swift` opens its showcase
│   ├── Sources/NibtreeUI/  one N<Name> view per ui/web component, plus the theme palette and presets
│   ├── Sources/NibtreeTokens/ the design tokens as Swift, written by `bun run ui:tokens`
│   ├── Sources/NibtreeShowcase/ the showcase app and `--render` (every story to PNG)
│   └── Tests/              Swift Testing tests (`bun run ui:swift:test`)
└── design-tokens/          colors.json, tokens.json, components*.json and the generators
    └── generated/          XAML (windows) and GTK CSS (linux)
```

See [UI Library](UI-Library.md) and [Swift UI Library](Swift-UI-Library.md).

## Docs: `docs/wiki/`

```text
docs/wiki/
├── features.json           the map: every page, every feature and its screenshots
├── usage/                  pages for people who use the app
├── developer/              pages for people who work on it (this folder)
└── images/                 screenshots, referenced by the usage pages
```

## GitHub: `.github/`

```text
.github/
├── workflows/
│   ├── ci.yml              checks every push and pull request
│   ├── beta.yml            opens a beta release pull request
│   ├── beta-publish.yml    publishes the beta once CI passes on develop
│   ├── stable.yml          opens a stable release pull request
│   ├── stable-promote.yml  opens the develop to master pull request
│   ├── stable-publish.yml  publishes the stable release from master
│   ├── release.yml         builds the macOS app and attaches it
│   └── wiki.yml            publishes docs/wiki to the GitHub wiki
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml      the bug form (the app fills in version and platform)
│   ├── feature_request.yml the feature request form
│   └── config.yml          blank issues allowed, plus a link to the releases
└── pull_request_template.md   what and why, test plan, docs checklist
```

The workflows are explained in [Releases and CI](Releases-and-CI.md).

## How the folders connect

```mermaid
flowchart LR
  Views["src/lib/views and merge"] --> Stores["src/lib/stores"]
  Stores --> Api["src/lib/api.ts"]
  Views --> Api
  Api -->|"Tauri IPC"| Cmds["src-tauri/src/commands"]
  Cmds --> GitMod["src-tauri/src/git"]
  Cmds --> Merge["src-tauri/src/merge"]
  Cmds --> Watch["watcher.rs and config.rs"]
  Cmds --> Services["terminal, search, scripts,<br/>github, mcp"]
  Scripts["scripts/version.ts"] --> Versions["Cargo.toml, Cargo.lock,<br/>package.json, CHANGELOG.md"]
  Wiki["docs/wiki"] --> Build["scripts/build-wiki.ts"]
  Flows[".github/workflows"] --> Scripts
  Flows --> Build
  Shots["scripts/screenshots.ts"] -->|"make-docs-demo.sh"| Images["docs/wiki/images"]
  Images --> Wiki
  Versions -->|"CHANGELOG.md?raw"| Views
```

The UI only reaches Rust through `api.ts`, and Rust only reaches git through `src-tauri/src/git`. The workflows never contain release logic of their own: they call the scripts, so you can run the same steps on your machine.

## Generated folders

These appear after an install or a build and are never committed. You can delete any of them safely; the next build brings them back.

- `node_modules/`: JS dependencies from `bun install`.
- `.svelte-kit/`: SvelteKit's generated types and config (`bun run check` runs `svelte-kit sync` to refresh it).
- `build/`: the built UI. Tauri embeds it in the app, and the Rust tests need it too, which is why CI builds the frontend before `cargo test`.
- `src-tauri/target/`: Rust build output, including the release `.app`.
- `src-tauri/gen/`: schemas Tauri generates for the capability files.

## Where do I put...

- **A new Tauri command?** In the matching `src-tauri/src/commands/*.rs`, registered in `lib.rs`, with a wrapper in `api.ts`, DTOs in `types.ts` and a row on a Commands page. See [Backend](Backend.md).
- **A new menu item?** In `src/lib/menu/menuSpec.ts`, with its action in `menuActions.ts`. See [How the Menus Work](How-the-Menus-Work.md).
- **A new setting?** In `src/lib/stores/settings.svelte.ts`, validated on load by `parsePreferences` in `settingsData.ts`. See [How Settings Work](How-Settings-Work.md).
- **Tricky logic for a component?** In a pure `.ts` file beside it, with a test. See [Testing](Testing.md).
- **A new color?** As a token in `ui/design-tokens/colors.json` (light and dark; `bun run ui:tokens` writes `colors.css`) and in the UI library's `themes/colorTokens.ts`, with a derived value for the other themes in `themes/derive.ts`. See [How Color Themes Work](How-Color-Themes-Work.md).
