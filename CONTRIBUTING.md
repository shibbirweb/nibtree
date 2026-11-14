# Contributing to Nibtree

Thank you for helping! Bug reports, ideas, docs fixes and code are all welcome. This page is the short version;
the full rules, with the reason for each one, are in the wiki's
[Contributing](https://github.com/shibbirweb/nibtree/wiki/Contributing) page.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug**: use the [bug form](https://github.com/shibbirweb/nibtree/issues/new?template=bug_report.yml).
  Check the [known issues](https://github.com/shibbirweb/nibtree/issues?q=is%3Aissue+is%3Aopen+label%3A%22known+issue%22)
  first. In the app, Settings > About > Report a Bug fills in your versions.
- **Ask for a feature**: use the [feature form](https://github.com/shibbirweb/nibtree/issues/new?template=feature_request.yml).
  The [milestones](https://github.com/shibbirweb/nibtree/milestones) show what is planned.
- **Improve the docs**: the wiki lives in `docs/wiki/` and is published from this repository, so docs changes are
  pull requests too.
- **Pick an issue**: look for
  [good first issue](https://github.com/shibbirweb/nibtree/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  or [help wanted](https://github.com/shibbirweb/nibtree/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22),
  and say in the issue that you are on it.
- **Security problems** go through a private report, never a public issue: see [SECURITY.md](SECURITY.md).

## Set up

You need Rust (stable), [Bun](https://bun.sh) and git. Bun is the only JavaScript tool: do not use npm, npx or
node for the project.

```sh
bun install
bun tauri dev
```

The [Developer Guide](https://github.com/shibbirweb/nibtree/wiki/Developer-Guide) explains the project, and
`scripts/make-conflict-repo.sh` and `scripts/make-workspace-demo.sh` build demo repositories to try things on.

## Before you open a pull request

1. Branch from `develop` and open the pull request against `develop`.
2. Keep it to one change. New UI is a component in the UI library (`ui/web`) first, then used in the app.
3. Run the checks; all must be clean:

   ```sh
   bun run format
   bun run check
   bun run test
   cd src-tauri && cargo test --workspace && cargo clippy --workspace --all-targets
   ```

4. Update the docs in the same pull request: the user page and developer chapter in `docs/wiki`, a "Bugs we fixed"
   entry for a bug fix, and a line under `## [Unreleased]` in `CHANGELOG.md` for anything users notice. Run
   `bun scripts/build-wiki.ts --check`.
5. Fill in the pull request template. The test plan is plain bullet points: what you ran, what you checked by hand,
   and what you could not check.

## Code style in short

- Every `if` has braces, also in TypeScript and Rust.
- TypeScript and JavaScript end statements with semicolons and put a trailing comma after the last item of
  multi-line lists.
- Name parameters after what they hold (`repoPath`, `commitId`), never just `id` or `path`.
- Default missing data so it never throws (`?? null`, `?? []`, `unwrap_or_default()`).
- Never use the em-dash character anywhere: code, comments, UI text, commits or docs.
- Svelte 5 runes only; colors only from the design tokens.

## Commit messages

```text
type:[GM-N] one-line summary
```

`type` is `feat`, `fix`, `docs`, `test` or `chore` (`feat!` for a breaking change). The release tools read it, so
pick it honestly. Ask in the issue for a `GM` ticket number if you do not have one. No `Co-Authored-By` lines.

## How the project is tracked

- **Issues** hold every feature, bug and known issue. Labels give the kind (`bug`, `enhancement`, `known issue`,
  `documentation`), the area (`area: git`, `area: editor`, ...) and the priority.
- **Milestones** group the work by release (`0.1.0`, `0.2.0`) or by theme (Markdown, performance, the browser
  version, the Swift UI library, the native app).
- Shipped features are kept as closed issues in the `0.1.0 betas` milestone, each linking to its user guide page
  and developer chapter.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
