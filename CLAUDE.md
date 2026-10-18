# Nibtree

Native macOS Git client (Tauri 2) with a 3-way merge tool, workspaces, tabs, blame and history. Rust backend in `src-tauri/`, Svelte 5 + TypeScript UI in `src/`, CodeMirror 6 for every text pane.

## Commands

Bun is the only JS tool. Never use npm, npx or node (the system Node is too old); scripts run on Bun's runtime via `bun --bun`.

```sh
bun install                    # dependencies
bun tauri dev                  # run the app (hot reload); add -- -- /path/to/folder to open a folder
bun run check                  # svelte-check + TypeScript: must end with 0 errors and 0 warnings
bun run test                   # Vitest (frontend unit tests)
bun run format                 # Prettier: format src/, ui/ and scripts/ (format:check is what CI runs)
bun run ui:migration           # what each app .svelte file still owns instead of the UI library (see below)
bun run ui:swift               # the Swift UI library showcase (ui/swift); --render <dir> in ui/swift draws stories
bun run ui:swift:test          # Swift Testing tests of ui/swift (works with the Command Line Tools, no Xcode)
bun run ui:swift:coverage      # ui/web components that have no Swift twin yet
bun run ui:swift:parity        # every Swift component vs its web twin: at least 99% match and faster (CI gate)
bun run ui:swift:compare       # web and Swift side by side with editable props, match and speed (localhost:1433)
cd src-tauri && cargo test --workspace     # Rust unit and git integration tests (app and cli/)
cd src-tauri && cargo clippy --workspace --all-targets   # must report no warnings
bun tauri build --bundles app  # release .app in src-tauri/target/release/bundle/macos
bun run ui                     # UI library showcase at http://localhost:1430 (ui/web)
bun run ui:tokens              # write every platform's design tokens from ui/design-tokens
bun run ui:docs                # write ui/web/COMPONENTS.md and docs/components/*.md from the component docs
bun run ui:parity              # check every library component against the app's own UI (light and dark)
```

Demo data for manual testing:
- `scripts/make-conflict-repo.sh <dir> [--rebase]`: repo stopped in a merge/rebase with every conflict type, long files and M/A/U/D/R samples.
- `scripts/make-workspace-demo.sh <dir>`: folder with several repos (one nested, one mid-merge, one clean) plus a plain folder.

Both refuse non-empty targets. The Rust tests run the conflict script and assert its exact output, so update `src-tauri/src/git/tests.rs` when changing it.

## Architecture

- **Writes go through the git CLI** (`src-tauri/src/git/cli.rs`) so hooks, credentials, signing and config behave like the terminal. **Reads use git2** (`src-tauri/src/git/*.rs`). Blame uses `git blame --porcelain` (with `--contents -` for unsaved text).
- **Commands** live in `src-tauri/src/commands/*.rs`, are registered in `src-tauri/src/lib.rs`, and run blocking work through `commands::blocking`. Args are camelCase in JS, snake_case in Rust. Errors are `AppError` serialized as `{ kind, message }`.
- **Frontend bridge**: every command has a typed wrapper in `src/lib/api.ts`; DTO mirrors live in `src/lib/types.ts`. Keep both in sync with Rust (serde `rename_all = "camelCase"`).
- **State**: `src/lib/stores/repo.svelte.ts` (`repoStore`) owns the workspace (one or more folders), repositories, per-repo statuses, the active repo, tabs and views. Mutations go through `repoStore.run(label, work, { success, repoPath })` / `runOp(...)` so busy state, error toasts and refreshes stay consistent.
- **Settings** persist in `~/.nibtree/settings.json` (preferences) and `state.json` (recent folders, layout) via `src/lib/stores/settings.svelte.ts`. Validate every loaded value; never overwrite a settings.json that failed to parse.
- **Paths**: file tabs, the Files panel, Back/Forward and breadcrumbs use **absolute paths**. Git operations use **repo-relative paths** with the repo root. Convert with `src/lib/stores/workspacePaths.ts` (`folderFor`, `locateAbsolute`, `relativeTo`, `joinPath`); never concatenate strings by hand. Absolute paths use `/` on Windows too (`C:/Users/me`): in Rust, real paths come from `paths::real` / `RealPath::real_path` (clippy forbids `canonicalize`) and every absolute path sent to the page goes through `paths::to_ui`; on the page, dialog and drop paths go through `fromNativePath`, and absolute checks use `isAbsolutePath`, never `startsWith("/")`.
- **Merge tool**: pure logic in `src/lib/merge/model.ts` (tested), CodeMirror glue in `extensions.ts`, UI in `MergeEditor.svelte`. The Rust engine is `src-tauri/src/merge/engine.rs`, checked against `git merge-file`.
- **UI library and design system**: `ui/web/` is the Svelte component library (components, tested logic, one
  doc per component, the showcase); `ui/design-tokens/` holds colors, sizes and component measurements that
  generate CSS, Swift (macOS), XAML (Windows) and GTK CSS (Linux) for future native apps. AI agents read
  `ui/web/COMPONENTS.md` and `ui/web/docs/components/<Name>.md`, or ask the `nibtree-ui` MCP server
  (`ui/mcp/`, registered in `.mcp.json`: list, search and get components, tokens, icons and rules). Tests keep
  docs equal to each component's `$props()`, generated files fresh, and the generated `colors.css` equal to the
  theme catalog's built-in themes.
- **Swift UI library**: `ui/swift/` is the SwiftUI twin of `ui/web` that the native app (Nibtree Native, settings in
  `~/.nibtree-native`) is built from: one `N<Name>` view per web component with the same props as presets, colors
  from `Palette` (`.nibtreeTheme`), sizes only from the generated `Sources/NibtreeTokens`. Add a component with its
  story in `Stories.swift` and parity scenarios in `ui/swift/parity/<Name>.json`; `bun run ui:swift:coverage` is the
  burn-down. Every component must match its web twin to at least 99% (near and at the same spot), render faster,
  and have a scenario for every prop and every value of its own enums (`bun run ui:swift:parity`, also in CI). See `docs/wiki/developer/Swift-UI-Library.md`.
- **Editor engines live in the library**: the Markdown engine is `ui/web/src/lib/markdown/` with the
  `MarkdownPreview` and `MarkdownEditor` components; the app keeps only glue (`src/lib/markdown/markdownContext.ts`,
  `viewMode.ts`) and thin views that pass links, settings and keys as props and events. Library code never imports
  `$lib`. CodeMirror (`CodeEditor`, `DiffView`, `MergeView`) moves the same way next.
- **Memory is a feature**: lazy-load directories and languages, virtualize long lists, destroy CodeMirror views on unmount, no persistent backend caches, poll only while visible. Check `cargo build --release` size and the status bar memory readout after big changes.

## Code style (org rules, mandatory)

- `if` statements always use braces; no single-line ifs (also in TS and Rust).
- TS/JS: end statements with semicolons; trailing comma after the last item of multi-line objects, arrays and argument lists.
- Name parameters after the domain entity (`repoPath`, `filePath`, `commitId`, `branchName`, `stashIndex`), not `id` or `path` alone.
- Default external or optional data so a missing value never throws (`?? null`, `?? []`, `unwrap_or_default`).
- **Never use the em-dash character** anywhere: code, comments, UI text, commits, docs. Use a colon, comma or hyphen.
- Comments are sparse and explain why, matching the surrounding code.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`), `onclick`-style attributes, no `export let`. Use `$state.raw` for large arrays and objects that are replaced, not mutated.
- Colors come from the CSS tokens in the UI library's `styles/colors.css` (generated from
  `ui/design-tokens/colors.json`, light and dark); no hard-coded colors in components. The app has no CSS file.
- **New UI is a library component first.** Build it in `ui/web/` (component, doc, story, tokens in
  `ui/design-tokens/`), then use it in the app, so every platform matches. Library components take no `class` or
  `style`: everything is a prop; lay out with `Stack`, write words with `Text`; sizes come from token variables.
  No prop takes a free number or free text for design (size, width, height, gap, padding, color): each is a named
  preset from `ui/design-tokens`; numbers are only data (counts, values, positions). There is no margin prop.
  Only reusable building blocks go in the library (primitives, and variants or props on them); compose
  screen-specific pieces from them instead of adding compound components.
- Keep UI text short and plain; confirm destructive actions (`dialogs.confirm({ danger: true })`).
- Never type a shortcut into UI text (no "Cmd+P" in a label or tooltip): use `commandKeys(id)`, `withCommandKeys(title, id)` or `localKeys("CmdOrCtrl+...")` from `commands/commandRuntime.ts`, so Windows shows Ctrl and custom keys show up.

## Testing rules

- Put non-trivial logic in pure `.ts` modules next to their component and cover them with `*.test.ts` (Vitest). Examples: `merge/model.ts`, `editor/lineDiff.ts`, `stores/tabs.ts`, `stores/navHistory.ts`.
- Rust tests use real temporary repositories via `src-tauri/src/test_support.rs` (isolated from the user's git config). Add tests with every backend change.
- Before reporting work as done: `bun run format`, then `bun run check`, `bun run test`, `cargo test --workspace`, `cargo clippy --workspace --all-targets` all clean. Say plainly if something could not be verified (for example UI behavior that needs a visual check).

## Git and PRs

- Commit author for this repository: name `MD. Shibbir Ahmed`, email `shibbirweb@gmail.com`. Commit with this identity (it is set in the repo-local git config; if it is missing, pass `-c user.name="MD. Shibbir Ahmed" -c user.email="shibbirweb@gmail.com"`), never with another global identity.
- Commit messages: `feat:[TICKET] summary` for features, `fix:[TICKET] summary` for fixes; the ticket in square brackets right after the colon, then a one-line summary. This repository's ticket key is `GM` (`bun scripts/version.ts next-ticket` prints the next free number). `feat!:` marks a breaking change and makes the next release major.
- No `Co-Authored-By` lines.
- **Do not commit until the user says so.** Never run `git commit` (or create a branch for it) until the user explicitly says "commit" for that change. Make the changes, show what changed, and ask; describing a constraint (such as "we need PRs for develop") is not permission to commit.
- **Never push until the user says so.** Never run `git push` (or anything else that sends to GitHub, such as deleting a remote branch) until the user explicitly says "push" for it. Permission to commit is not permission to push.
- PR test plans are plain bullet points, no checkboxes.
- Never commit build output (`node_modules`, `build`, `.svelte-kit`, `src-tauri/target`, `src-tauri/gen`).

## CI, versions and releases

- The version's source of truth is `src-tauri/Cargo.toml` (`tauri.conf.json` has none; Tauri uses Cargo's). `package.json` and the crate's `Cargo.lock` entry must agree: use `bun scripts/version.ts set x.y.z`, never hand edits. CI runs `bun scripts/version.ts check`.
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` in the same commit. Release notes and the in-app What's New come only from the changelog.
- Branches: feature work merges into `develop` by pull request (the beta line); `master` is stable and only takes `develop` through the release flow.
- Releases are automated, never cut by hand: "Beta release" (`beta.yml`) and "Stable release" (`stable.yml`) run `bun scripts/version.ts bump beta|release` and open a `chore:[GM-N] release x.y.z` pull request; after it merges and CI passes, `beta-publish.yml` / `stable-promote.yml` / `stable-publish.yml` publish, and `release.yml` builds. Do not bump the version or create tags yourself. Release commits use the `GM` ticket key (`bun scripts/version.ts next-ticket`).
- A stable release only finishes a published beta with no untried commits (anything but `docs`, `test`, `chore`) on top, so use those types honestly.
- Betas are `x.y.z-beta.N` pre-releases; stable installs are never offered them. The update check (`src/lib/update/`) is notify only and must stay quiet when offline.
- Keep CI passing: `bun install --frozen-lockfile` (commit `bun.lock`), `cargo test --locked` (commit `Cargo.lock`), clippy with `-D warnings`.
- Signing and notarization need the `APPLE_*` secrets; never commit certificates or passwords.
- Cross-platform (Windows, Linux) builds are planned: keep platform-specific code behind `cfg`/runtime checks, and pick download assets per platform in `src/lib/update/releases.ts`.

## Documentation (docs/wiki, published to the GitHub wiki)

- `docs/wiki/features.json` maps every feature to a user page (`docs/wiki/usage/`), a developer chapter (`docs/wiki/developer/How-*.md`) and its screenshots (`docs/wiki/images/`). CI runs `bun scripts/build-wiki.ts --check`, which fails on a missing page, screenshot or link, an unlisted page, an unused image, an em-dash, a page over 1200 words or a bad mermaid block. `wiki.yml` publishes on pushes to master.
- Docs change in the same commit as the code, for every kind of change:
  - New feature: add it to `features.json`, write its user page and its developer chapter (why we need it, how it works with mermaid diagrams, where the code lives, design decisions, tests, keeping in sync), and add its screenshots to `scripts/screenshots.ts`.
  - Changed behavior or UI: update the user page, the developer chapter and retake the affected screenshots (`bun scripts/screenshots.ts <name ...>` with the app running under `GM_IPC_BRIDGE=1 bun tauri dev`; view each image before committing).
  - Bug fix: add an entry to "Bugs we fixed" in the feature's developer chapter: the issue (what the user saw), why it happened, and the fix and why it was chosen.
  - Platform changes (build, CI, releases, versioning, testing, architecture) update the matching page in `docs/wiki/developer/`.
- Writing: simple, friendly English; short sentences; explain git terms on first use; pages of about 300 to 1000 words (split rather than grow); relative links (`Merge-Tool.md`, `../developer/How-Blame-Works.md`, `../images/x.png`); verify every label, setting and shortcut in the code.
- Screenshots come from the real app through the dev-only IPC bridge (`src/lib/dev/ipcBridge.ts`, relayed by Vite only with `GM_IPC_BRIDGE=1`) and the demo built by `scripts/make-docs-demo.sh`. Never point the bridge at a real repository or the user's `~/.nibtree`.
- A screenshot that cannot be taken yet is written as `[TODO:name.png]` in the usage page where the image goes (still listed in `features.json` and defined in `scripts/screenshots.ts`). The wiki check accepts it and lists every pending shot; replace the marker with the image once it is taken.

## Gotchas

- `bun tauri dev` leaves Vite on port 1420; if a restart fails with "Port 1420 is already in use", stop the old Vite/bun process first.
- macOS Option changes typed characters: match shortcuts with Option by `event.code`, not `event.key`.
- Window-level key handlers must skip when `dialogs.active` or `event.defaultPrevented` to avoid double handling.
- CodeMirror: never dispatch to a view from inside that view's own update listener; block widgets must come from a StateField or facet, not a ViewPlugin.
- Processes started from a terminal have the terminal as their macOS "responsible" process; `src-tauri/src/memory.rs` handles this for the memory readout.
