#!/usr/bin/env bun
/**
 * Read and change the one version number this project has.
 *
 * `src-tauri/Cargo.toml` is the source of truth: Tauri builds the app with it
 * (tauri.conf.json has no version of its own), the About/Settings screen shows
 * it, and the update check compares against it. `package.json`, the npm
 * launcher (`npm/nibtree/package.json`, with its platform packages' pins) and
 * the crate's entry in `Cargo.lock` carry the same number so nothing drifts.
 *
 *     bun scripts/version.ts show               print the version
 *     bun scripts/version.ts check              verify every file agrees (CI runs this)
 *     bun scripts/version.ts set 0.2.0          move every file at once
 *     bun scripts/version.ts notes [0.2.0]      print a changelog section (Unreleased by default)
 *     bun scripts/version.ts pending            say whether a release is due
 *     bun scripts/version.ts bump <level>       move to the next version: beta | release | patch | minor | major | x.y.z
 *     bun scripts/version.ts untried            list unreleased commits that change the program (not docs, test, chore)
 *     bun scripts/version.ts next-ticket        print the next free GM ticket number
 *
 * Releases are normally cut by the "Beta release" and "Stable release" GitHub
 * workflows, which run `bump` and open the release pull request; see README.md.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cargoLockVersion,
  cargoTomlVersion,
  changelogSection,
  dateChangelog,
  isBeta,
  type Level,
  nextTicket,
  nextVersion,
  SEMVER,
  setCargoLockVersion,
  setCargoTomlVersion,
  suggestLevel,
  untriedSubjects,
} from "./versioning";
import { type Manifest, manifestProblems, withVersion } from "./npmPackages";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CARGO_TOML = join(ROOT, "src-tauri", "Cargo.toml");
const CARGO_LOCK = join(ROOT, "src-tauri", "Cargo.lock");
const PACKAGE_JSON = join(ROOT, "package.json");
const NPM_LAUNCHER = join(ROOT, "npm", "nibtree", "package.json");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const CRATE = "nibtree";
/** The ticket key release commits use, like `chore:[GM-12] release 0.2.0`. */
const TICKET_KEY = "GM";

const read = (path: string) => readFileSync(path, "utf8");

function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function authoritative(): string {
  const version = cargoTomlVersion(read(CARGO_TOML));
  if (version === null) {
    console.error("could not find the version in the [package] table of src-tauri/Cargo.toml");
    process.exit(1);
  }
  return version;
}

function collect(): [string, string | null][] {
  return [
    ["src-tauri/Cargo.toml", cargoTomlVersion(read(CARGO_TOML))],
    ["src-tauri/Cargo.lock", cargoLockVersion(read(CARGO_LOCK), CRATE)],
    ["package.json", (JSON.parse(read(PACKAGE_JSON)).version as string | undefined) ?? null],
    ["npm/nibtree/package.json", launcherVersion()],
  ];
}

/** The npm launcher's version, with what disagrees inside it (its platform packages' pins). */
function launcherVersion(): string | null {
  const manifest = JSON.parse(read(NPM_LAUNCHER)) as Manifest;
  const problems = manifestProblems(manifest, manifest.version);
  return problems.length > 0 ? `${manifest.version} (${problems[0]})` : (manifest.version ?? null);
}

function check(): number {
  const found = collect();
  const expected = found[0][1];
  const width = Math.max(...found.map(([label]) => label.length));
  for (const [label, value] of found) {
    console.log(`  ${label.padEnd(width)}  ${value ?? "(missing)"}${value === expected ? "" : "   <- disagrees"}`);
  }
  const wrong = found.filter(([, value]) => value !== expected).map(([label]) => label);
  if (expected === null || wrong.length > 0) {
    console.error(
      `\nsrc-tauri/Cargo.toml is the source of truth. Run \`bun scripts/version.ts set ${expected ?? "x.y.z"}\` and commit.`,
    );
    return 1;
  }
  console.log(`\nall files agree on ${expected}`);
  return 0;
}

function set(version: string): number {
  if (!SEMVER.test(version)) {
    console.error(`'${version}' is not a semver version, expected something like 0.2.0 or 0.2.0-beta.1`);
    return 2;
  }
  const toml = read(CARGO_TOML);
  const current = cargoTomlVersion(toml);
  const updated = setCargoTomlVersion(toml, version);
  if (!updated) {
    console.error("could not rewrite the version in src-tauri/Cargo.toml");
    return 1;
  }
  writeFileSync(CARGO_TOML, updated, "utf8");
  console.log(`src-tauri/Cargo.toml  ${current} -> ${version}`);

  const manifest = JSON.parse(read(PACKAGE_JSON));
  const previous = manifest.version;
  manifest.version = version;
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`package.json          ${previous} -> ${version}`);

  const launcher = JSON.parse(read(NPM_LAUNCHER)) as Manifest;
  writeFileSync(NPM_LAUNCHER, `${JSON.stringify(withVersion(launcher, version), null, 2)}\n`, "utf8");
  console.log(`npm/nibtree/package.json  ${launcher.version} -> ${version}`);

  const lock = read(CARGO_LOCK);
  const lockPrevious = cargoLockVersion(lock, CRATE);
  const lockUpdated = setCargoLockVersion(lock, CRATE, version);
  if (!lockUpdated) {
    console.error(`could not find ${CRATE} in src-tauri/Cargo.lock`);
    return 1;
  }
  writeFileSync(CARGO_LOCK, lockUpdated, "utf8");
  console.log(`src-tauri/Cargo.lock  ${lockPrevious} -> ${version}`);
  console.log();
  return check();
}

function notes(version?: string): number {
  const section = changelogSection(read(CHANGELOG), version);
  const label = version ?? "Unreleased";
  if (section === null) {
    console.error(`CHANGELOG.md has no [${label.replace(/^v/, "")}] section to take release notes from`);
    return 1;
  }
  if (section === "") {
    console.error(`the [${label.replace(/^v/, "")}] section of CHANGELOG.md is empty`);
    return 1;
  }
  console.log(section);
  return 0;
}

/** Commits no release tag contains yet, merges left out. */
function unreleasedSubjects(): string[] {
  const out = git("log", "HEAD", "--no-merges", "--format=%s", "--not", "--tags=v*");
  return out ? out.split("\n").filter(Boolean) : [];
}

function lastTag(): string | null {
  return git("for-each-ref", "--sort=-creatordate", "--count=1", "--format=%(refname:short)", "refs/tags/v*") || null;
}

function pending(): number {
  const current = authoritative();
  const subjects = unreleasedSubjects();
  console.log(`Current version  ${current}`);
  console.log(`Last release     ${lastTag() ?? "none yet"}`);
  if (subjects.length === 0) {
    console.log("\nNothing has landed since that release.");
    return 0;
  }
  const level = suggestLevel(subjects);
  console.log(`Unreleased       ${subjects.length} commits`);
  if (isBeta(current)) {
    console.log(
      `\nThe next beta would be ${nextVersion(current, "beta")}; finishing it makes ${nextVersion(current, "release")}.`,
    );
  } else {
    console.log(
      `\nA ${level} release would be ${nextVersion(current, level)}, or ${nextVersion(current, "beta", level)} as a beta.`,
    );
  }
  console.log('Run the "Beta release" workflow on develop to cut it; it bumps the version for you.');
  return 0;
}

/**
 * Unreleased commits that change what people run, as "hash subject" lines. A
 * stable release only finishes a beta with none of these on top of it.
 */
function untried(): number {
  const out = git("log", "HEAD", "--no-merges", "--format=%h %s", "--not", "--tags=v*") ?? "";
  const lines = out.split("\n").filter(Boolean);
  const subjects = new Set(untriedSubjects(lines.map((line) => line.slice(line.indexOf(" ") + 1))));
  for (const line of lines) {
    if (subjects.has(line.slice(line.indexOf(" ") + 1))) {
      console.log(line);
    }
  }
  return 0;
}

/**
 * Moves every file to the next version for `requested` and, for a stable
 * version, dates the changelog. Leaves everything alone when nothing has
 * landed since the last release, except finishing a beta, which usually ships
 * exactly what was tried. The release workflows run this and treat an
 * unchanged version as "nothing to release".
 */
function bump(requested: string | undefined): number {
  const levels: Level[] = ["beta", "release", "patch", "minor", "major"];
  if (!requested || !(levels.includes(requested as Level) || SEMVER.test(requested))) {
    console.error(`Usage: bun scripts/version.ts bump <${levels.join(" | ")} | x.y.z>`);
    return 2;
  }
  const current = authoritative();
  const subjects = unreleasedSubjects();
  const finishing = isBeta(current) && requested === "release";
  if (subjects.length === 0 && !finishing && !SEMVER.test(requested)) {
    console.log(`Nothing has landed since ${lastTag() ?? current}, so there is nothing for a new release to hold.`);
    return 0;
  }
  const target = SEMVER.test(requested) ? requested : nextVersion(current, requested as Level, suggestLevel(subjects));
  if (!target) {
    console.error(
      isBeta(current)
        ? `${current} is a beta: move it on with \`bump beta\` or finish it with \`bump release\``
        : `cannot make a '${requested}' release from ${current}; \`bump release\` only finishes a beta`,
    );
    return 2;
  }
  // A beta is published with the Unreleased notes as they are, so they must exist.
  if (isBeta(target) && !changelogSection(read(CHANGELOG))) {
    console.error("CHANGELOG.md has nothing under [Unreleased]. Describe what the beta holds there first.");
    return 1;
  }
  if (!isBeta(target) && changelogSection(read(CHANGELOG), target) !== null) {
    console.error(`CHANGELOG.md already has a [${target}] section, so ${target} looks released already`);
    return 1;
  }
  console.log(`${requested}: ${current} -> ${target}\n`);
  if (set(target) !== 0) {
    return 1;
  }
  if (!isBeta(target)) {
    const today = new Date().toLocaleDateString("en-CA");
    writeFileSync(CHANGELOG, dateChangelog(read(CHANGELOG), target, today), "utf8");
    console.log(`CHANGELOG.md          [Unreleased] -> [${target}] - ${today}`);
  }
  console.log(
    `\nCommit it as \`chore:[${TICKET_KEY}-${ticket()}] release ${target}\` and merge it into develop by pull request.`,
  );
  return 0;
}

function ticket(): number {
  return nextTicket((git("log", "--all", "--format=%s") ?? "").split("\n"), TICKET_KEY);
}

const [command, argument] = process.argv.slice(2);
const commands: Record<string, () => number> = {
  show: () => {
    console.log(authoritative());
    return 0;
  },
  check,
  set: () => set(argument ?? ""),
  notes: () => notes(argument),
  pending,
  bump: () => bump(argument),
  untried,
  "next-ticket": () => {
    console.log(ticket());
    return 0;
  },
};

const run = command ? commands[command] : undefined;
if (!run) {
  console.error(
    "Usage: bun scripts/version.ts <show | check | set x.y.z | notes [x.y.z] | pending | bump <level> | untried | next-ticket>",
  );
  process.exit(2);
}
process.exit(run());
