# Releases and CI

Releases are cut by GitHub workflows, not by hand. A person only starts a release and merges its pull request; the workflows do the rest and refuse anything unsafe.

## Branches

- **`develop`** is the default branch and the beta line. All work lands here by pull request.
- **`master`** is stable. It only moves when a stable release is promoted.
- **`release/v<version>`** branches are made by the release workflows and merged into `develop` by pull request.

```mermaid
flowchart LR
  F["feature branch"] -->|"pull request"| D["develop<br/>beta line"]
  D -->|"Beta release or Stable release"| R["release/v... branch"]
  R -->|"release pull request"| D
  D -->|"Promote stable:<br/>merge commit"| M["master<br/>stable"]
```

```mermaid
%%{init: {"gitGraph": {"mainBranchName": "master"}}}%%
gitGraph
  commit id: "start"
  branch develop
  checkout develop
  branch feature
  commit id: "feat: tabs"
  checkout develop
  merge feature
  branch release/v0.2.0-beta.1
  commit id: "release 0.2.0-beta.1"
  checkout develop
  merge release/v0.2.0-beta.1 tag: "v0.2.0-beta.1"
  commit id: "docs: wiki"
  branch release/v0.2.0
  commit id: "release 0.2.0"
  checkout develop
  merge release/v0.2.0
  checkout master
  merge develop tag: "v0.2.0"
```

## The workflows

| Workflow | Started by | What it does |
| --- | --- | --- |
| `ci.yml` (CI) | push to `develop` or `master`, any pull request, a call, or a manual run | the checks below |
| `beta.yml` (Beta release) | Run workflow on `develop` | bumps to the next beta and opens a release pull request |
| `beta-publish.yml` (Publish beta) | CI finishing on `develop` | publishes an unpublished beta as a GitHub pre-release |
| `stable.yml` (Stable release) | Run workflow on `develop` | finishes the beta, dates the changelog, opens a release pull request |
| `stable-promote.yml` (Promote stable) | CI finishing on `develop` | opens the `develop` to `master` pull request |
| `stable-publish.yml` (Publish stable) | CI finishing on `master` | publishes the stable release as the latest one |
| `release.yml` (Release) | a call, a release published by hand, or a manual run | builds the macOS app and attaches it |
| `browser.yml` (Browser version) | push to `develop` or `master`, any pull request, a call from `release.yml` | tests the browser version on six platforms and in Docker; publishes it to npm and Docker for a release |
| `windows-installer.yml`, `macos-app.yml` | any pull request | build, check and keep the Windows and macOS apps |
| `wiki.yml` (Wiki) | push to `master` that touches the docs, or a manual run | publishes `docs/wiki` to the GitHub wiki |

## CI

`ci.yml` runs two jobs on `macos-latest`, because the app ships for macOS, and the same two on Windows.

- **Frontend:** `bun install --frozen-lockfile`, `bun scripts/version.ts check`, `bun scripts/file-icons.ts --check` (see [How file icons work](How-File-Icons-Work.md)), `bun run check`, `bun run test` and, in the step "Wiki docs are complete", `bun scripts/build-wiki.ts --check`.
- **Rust:** builds the frontend first (`tauri::generate_context!` embeds it, so it must exist), then `cargo test --locked --workspace` and `cargo clippy --locked --workspace --all-targets -- -D warnings`.
- **Windows:** the same checks in `windows-frontend` and `windows-rust`, side by side on `windows-latest`; a failed check never skips the next. Both must pass ([Windows Support](Windows-Support.md)).

`--frozen-lockfile` and `--locked` fail when `bun.lock` or `Cargo.lock` is out of date, so always commit them.

## A beta release

```mermaid
sequenceDiagram
  actor Dev as Maintainer
  participant Beta as Beta release
  participant PR as Release pull request
  participant CI
  participant Pub as Publish beta
  participant Rel as release.yml
  Dev->>Beta: Run workflow on develop (dry run optional)
  Beta->>Beta: CI passed on develop? No release under way?
  Beta->>Beta: version.ts bump beta, next-ticket
  Beta->>PR: push release branch, open PR into develop
  Beta->>CI: dispatch CI on the release branch
  Dev->>PR: merge
  CI->>CI: runs on develop
  CI->>Pub: completed with success
  Pub->>Pub: beta version with no tag yet?
  Pub->>Pub: gh release create, pre-release, Unreleased notes
  Pub->>Rel: call with tag and tested = true
  Rel->>Rel: check tag and code, build universal app, attach
```

The version is worked out, never typed. See [Versioning and Changelog](Versioning-and-Changelog.md).

## A stable release

```mermaid
sequenceDiagram
  actor Dev as Maintainer
  participant Stable as Stable release
  participant PR as Pull requests
  participant CI
  participant Promote as Promote stable
  participant Publish as Publish stable
  participant Rel as release.yml
  Dev->>Stable: Run workflow on develop
  Stable->>Stable: published beta? nothing untried on top?
  Stable->>Stable: version.ts bump release, date the changelog
  Stable->>PR: open release PR into develop
  Stable->>CI: dispatch CI on the release branch
  Dev->>PR: merge the release PR
  CI->>Promote: CI passed on develop
  Promote->>Promote: stable version with no tag, nothing untried?
  Promote->>PR: open the develop to master PR
  Dev->>PR: merge with a merge commit
  CI->>Publish: CI passed on master
  Publish->>Publish: gh release create, latest, version notes
  Publish->>Rel: call with tag and tested = true
```

## Building: `release.yml`

It checks that every file agrees on the version, that the tag is exactly `v` plus the version in `src-tauri/Cargo.toml`, and that the pre-release flag matches (betas must be pre-releases, stable versions must not). Empty or GitHub-generated notes are replaced with the changelog section. Unless the caller says CI already passed, it runs `ci.yml` first. Then `tauri-action` builds a universal app (Apple Silicon and Intel) and attaches the `.dmg` and zipped `.app`. When the repository variable `WINDOWS_RELEASES` is `true`, `build-windows` also attaches the Windows installer. The `npm` job calls `browser.yml`, which builds the browser version for six platforms and publishes it to npm ([Browser Version Packages](Browser-Version-Packages.md)). Run workflow with a tag rebuilds an existing release. Signing is optional: add the `APPLE_*` secrets named at the top of the file and uncomment the matching lines.

## Publishing the wiki: `wiki.yml`

`wiki.yml` copies `docs/wiki` to the GitHub wiki when `master` changes. See [Publishing the Wiki](Publishing-the-Wiki.md).

## One-time repository setup

- Push `develop` and `master` and make `develop` the default branch. `workflow_run` workflows only run from the default branch, and Run workflow starts there.
- Settings, Actions, General, Workflow permissions: **Read and write permissions** and **Allow GitHub Actions to create and approve pull requests**. Without the second, no release pull request can be opened.
- Optionally protect `develop` and `master`: pull requests only, CI required.
- Keep the repository public, so the in-app update check can see releases.
- Open the Wiki tab and save any page once, so the wiki repository exists.
- For npm: the `nibtree` organization on npmjs.com and the `NPM_TOKEN` secret ([Browser Version Packages](Browser-Version-Packages.md)); for Docker Hub: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` ([Docker Image](Docker-Image.md)).

## Why it is built this way

- **Betas never reach stable users.** A beta is a GitHub pre-release, and the in-app update check, which only notifies and stays quiet when offline, offers it only to installs on the beta channel. See [How Updates Work](How-Updates-Work.md).
- **Merging is the decision.** A release pull request shows the version and notes before anything is published, and closing it cancels the release.
- **Publish only after CI passes on the exact commit.** The publish workflows check out the commit the CI run tested, so a merge landing meanwhile cannot slip into the release.
- **The untried rule.** A stable release only finishes a published beta with no `feat`, `fix` or other program change on top. Only `docs`, `test` and `chore` commits may ride along, because nobody has run anything else yet.
- **Every change enters through `develop`, releases too.** A version bump only on `master` would make `develop` number its next beta from the old version.
- **Merge commit, not squash, into `master`.** A squash creates a new commit that `develop` never had, so the branches drift apart and the next promotion conflicts. A merge commit keeps `master` an ancestor of `develop`.
- **One release at a time.** Beta and Stable release share one concurrency group, and each refuses to start while a release pull request is open or a beta is merged but unpublished.
- **GitHub's built-in token starts no workflows.** Anything done with `GITHUB_TOKEN`, such as publishing a release or opening a pull request, triggers nothing. So the publish workflows call `release.yml` directly, and the release workflows dispatch CI on their branch so the pull request gets checks.

## Lessons learned

**The first `release.yml` wrote a "v" into the app version.** It copied the tag into `tauri.conf.json`, so the app would have reported `v1.2.3`, which is not valid semver. Now the code is the source of truth, and the build only checks that the tag agrees.

**`ci.yml` cannot have a `concurrency` block.** It is also a reusable workflow, called by `release.yml`. A called workflow evaluates `github.workflow` and `github.ref` in the caller's context, so a group like `ci-${{ github.workflow }}-${{ github.ref }}` could clash with the caller's group and cancel or block it. We removed the block.

**Release pull requests had no checks.** Opened with the built-in token, they started no CI, so a required check would wait forever. Dispatching `ci.yml` with `gh workflow run` is the one start GitHub allows, and its result shows on the pull request's commit.
