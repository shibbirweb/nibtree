# Publishing the Wiki

The user guide and these developer pages live in `docs/wiki` in the repository, and `.github/workflows/wiki.yml`
copies them to the GitHub wiki. This page explains how. The other workflows are in [Releases and CI](Releases-and-CI.md).

A GitHub wiki is its own git repository (`<repo>.wiki.git`), so merging `docs/wiki` does not update it. `wiki.yml` runs on a push to `master` that touches `docs/wiki/**`, `scripts/build-wiki.ts`, `scripts/wiki.ts`, `src/lib/update/releases.ts` (it names the repository) or the workflow itself, and on Run workflow from any branch (for example `develop`, to seed the wiki). It:

1. builds the pages with `bun scripts/build-wiki.ts "$RUNNER_TEMP/wiki-pages"`, which checks everything first;
2. clones the wiki, and fails with a hint if it does not exist yet;
3. mirrors the files, so a page deleted from `docs/wiki` disappears from the wiki too;
4. commits as `github-actions[bot]` and pushes, or stops when nothing changed.

The build turns our folders into the flat wiki GitHub expects: the `# Title` line is dropped (the wiki prints the page name), links between pages become page names, images go to `images/`, links to other repository files become GitHub URLs on `develop`, and `Home`, `_Sidebar` and `_Footer` are generated from `features.json`. Every page starts with a comment saying it is generated, so nobody edits it in the wiki. See [Docs and Screenshots](Docs-and-Screenshots.md).
