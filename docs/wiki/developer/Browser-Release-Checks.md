# Browser Release Checks

A release of the browser version lands in four places: the GitHub release (with the desktop app), npm, ghcr.io
and Docker Hub. They are separate services, so no release can succeed or fail on all four at once. This page
explains how we make a half-finished release unlikely, loud when it happens, and easy to finish. The packages and
the image themselves are in [Browser Version Packages](Browser-Version-Packages.md) and
[Docker Image](Docker-Image.md).

## Before a release: the rehearsal

`.github/workflows/browser-rehearsal.yml` runs on every push to `develop`, the branch betas are cut from. It
calls `browser.yml` with `publish: true` and `dry_run: true`, so it walks the real release path:

1. release-mode programs (`--release`, with LTO and `panic = "abort"`) on all six platforms, each smoke tested
   with Bun and Node;
2. the Docker image on amd64 and arm64, each smoke tested in a container;
3. `bun scripts/npm-package.ts publish --dry-run` over every tarball: the registry check, the dist-tag and the
   order, with nothing uploaded;
4. the two-architecture Buildx build with every tag, without `--push`.

A newer push cancels an older rehearsal. Run workflow starts one by hand.

## During a release: no quiet skips

A release fails when `NPM_TOKEN`, `DOCKERHUB_USERNAME` or `DOCKERHUB_TOKEN` is missing. Earlier, a missing secret
only printed a warning: the run stayed green while nothing was published, which is the worst kind of failure
because nobody notices it.

```mermaid
flowchart LR
  P["platform builds"] --> N["publish (npm)"] --> VN["verify-npm"]
  P --> D["docker tests"] --> DP["docker-publish"] --> VD["verify-docker"]
```

npm and Docker are separate jobs, so one can fail while the other succeeds. The npm side publishes the platform
packages first and the launcher last: if anything fails in between, `nibtree@<version>` does not exist, so nobody
can install a launcher that points at a missing program.

## After a release: verify jobs

`release.yml` runs `browser-verify.yml` after the browser job, also when that job failed halfway, so whatever did
get published is checked. Run workflow starts it by hand for any tag. `scripts/release-verify.ts` checks what
people actually get, retrying for about five minutes while the registries catch up:

- **`verify-npm`**, on Linux, macOS and Windows: npm lists the launcher and all six platform packages at the
  version, the `next` or `latest` tag points at it, and `npx nibtree@<version> --version` and
  `npx nibtree@<tag> --version` both print it;
- **`verify-docker`**: in both registries the version has `linux/amd64` and `linux/arm64`, and `docker run` of
  the version and of its moving tag prints it. It signs in to ghcr.io, because a new package there starts private.

## When a release breaks halfway

Open the release run in Actions and choose **Re-run failed jobs**. It is safe:

- `npm-package.ts publish` skips every version npm already has, so it only uploads what is missing;
- pushing the same Docker tags again stores the same image;
- the verify jobs run again after it.

If the fix needs a code change, it goes into the next release: a published npm version cannot be replaced.

## Where the code lives

| File | What it does |
| --- | --- |
| `.github/workflows/browser-rehearsal.yml` | the rehearsal on `develop` |
| `.github/workflows/browser.yml` | `dry_run` and the secret checks |
| `.github/workflows/browser-verify.yml` | `verify-npm` and `verify-docker`, run by `release.yml` (or by hand for a tag) |
| `scripts/release-verify.ts` | the checks after publishing |
| `scripts/dockerImage.ts` | `imagePlatforms`, read from the image index (tested) |

## Design decisions

**Rehearse on `develop`, not on every pull request.** Release builds on six platforms take about half an hour.
`develop` is where every beta starts, so a rehearsal there runs before any release can, while pull requests stay
on the faster debug builds.

**Fail on a missing secret.** A loud failure can be fixed with a rerun; a silent skip is found by users.

**Check from the outside.** The verify jobs use `npx` and `docker pull` like everyone else, so they also catch a
package that was published but cannot be installed.

## Bugs we fixed

**The first rehearsal on `develop` failed at Publish to npm.** `bun publish --dry-run` stopped with "missing
authentication", though a dry run sends nothing. The rehearsal has no `NPM_TOKEN` on purpose, so it cannot upload
by mistake. `scripts/npm-package.ts` now gives a dry run a placeholder token when there is no real one: bun is
happy, and a placeholder could not publish even if the dry-run flag were lost. A real publish still needs the
secret and fails loudly without it.
