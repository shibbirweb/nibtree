// Pure helpers behind scripts/version.ts, kept separate so they can be tested.

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The version from the `[package]` table only, never a dependency's. */
export function cargoTomlVersion(text: string): string | null {
  let inPackage = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inPackage = trimmed === "[package]";
      continue;
    }
    if (inPackage) {
      const match = /^version\s*=\s*"([^"]+)"/.exec(trimmed);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

/** Replaces the version inside the `[package]` table; returns null when there is none. */
export function setCargoTomlVersion(text: string, version: string): string | null {
  const packageTable = /(\[package\][^[]*?version\s*=\s*)"[^"]+"/;
  return packageTable.test(text) ? text.replace(packageTable, `$1"${version}"`) : null;
}

/** The version recorded for `crate` in Cargo.lock. */
export function cargoLockVersion(text: string, crate: string): string | null {
  for (const block of text.split("[[package]]")) {
    if (new RegExp(`^\\s*name\\s*=\\s*"${crate}"\\s*$`, "m").test(block)) {
      return /^\s*version\s*=\s*"([^"]+)"\s*$/m.exec(block)?.[1] ?? null;
    }
  }
  return null;
}

/**
 * Rewrites the version recorded for `crate` in Cargo.lock, leaving every other
 * package alone; null when the crate is missing. The crate's own entry has no
 * checksum, so nothing else needs to change, and it needs no cargo (or network)
 * on the release runners. CI's `--locked` builds would catch a lockfile it broke.
 */
export function setCargoLockVersion(text: string, crate: string, version: string): string | null {
  const entry = new RegExp(`(\\[\\[package\\]\\]\\s*\\nname\\s*=\\s*"${crate}"\\s*\\nversion\\s*=\\s*)"[^"]+"`);
  return entry.test(text) ? text.replace(entry, `$1"${version}"`) : null;
}

export function isBeta(version: string): boolean {
  return /-beta\.\d+$/.test(version);
}

/**
 * The version as Debian writes it. dpkg reads everything after a `-` as the package revision, so
 * `0.2.0-beta.1` would sort above `0.2.0` and apt would never upgrade a beta to its stable release.
 * A `~` sorts before everything, even the end of the version: `0.2.0~beta.1` < `0.2.0`.
 */
export function debianVersion(version: string): string {
  const [core, ...pre] = version.split("-");
  return pre.length > 0 ? `${core}~${pre.join(".")}` : version;
}

export type Level = "patch" | "minor" | "major" | "beta" | "release";

/**
 * The next version for a level. From a stable version, `beta` starts the first
 * beta of the next minor (or `suggested`) release; from a beta, `beta` is the
 * next beta and `release` finishes it.
 */
export function nextVersion(
  current: string,
  level: Level,
  suggested: "patch" | "minor" | "major" = "minor",
): string | null {
  const [core] = current.split("-");
  const [major, minor, patch] = core.split(".").map(Number);
  const stable = {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`,
  };
  const beta = /-beta\.(\d+)$/.exec(current);
  if (beta) {
    if (level === "beta") {
      return `${core}-beta.${Number(beta[1]) + 1}`;
    }
    return level === "release" ? core : null;
  }
  if (level === "beta") {
    return `${stable[suggested]}-beta.1`;
  }
  return level === "release" ? null : stable[level];
}

/** The conventional commit type of a subject, like "feat" for `feat:[GM-3] tabs`, and whether it is marked breaking (`feat!:`). */
function commitKind(subject: string): { type: string; breaking: boolean } {
  const match = /^\s*([A-Za-z]+)(?:\([^)]*\))?(!)?\s*:/.exec(subject);
  return { type: match?.[1]?.toLowerCase() ?? "", breaking: match?.[2] === "!" };
}

/** A breaking commit (`feat!:`) suggests a major release, feat: a minor one, anything else a patch. */
export function suggestLevel(subjects: string[]): "patch" | "minor" | "major" {
  const kinds = subjects.map(commitKind);
  if (kinds.some((kind) => kind.breaking)) {
    return "major";
  }
  return kinds.some((kind) => kind.type === "feat") ? "minor" : "patch";
}

/**
 * Commits that change what people run: anything but docs, test and chore
 * (release commits are chore). A stable release may only finish a beta when
 * none of these landed after it, because nobody has tried them yet.
 */
export function untriedSubjects(subjects: string[]): string[] {
  return subjects.filter((subject) => !["docs", "test", "chore"].includes(commitKind(subject).type));
}

/** The next free ticket number for `key` (like GM), one past the highest used in these subjects. */
export function nextTicket(subjects: string[], key: string): number {
  const used = subjects.flatMap((subject) =>
    [...subject.matchAll(new RegExp(`\\[${key}-(\\d+)\\]`, "g"))].map((match) => Number(match[1])),
  );
  return used.length > 0 ? Math.max(...used) + 1 : 1;
}

/** A changelog section without its heading: `[Unreleased]` when no version is given. */
export function changelogSection(text: string, version?: string): string | null {
  const label = version === undefined ? "Unreleased" : version.replace(/^v/, "");
  const start = text.indexOf(`## [${label}]`);
  if (start === -1) {
    return null;
  }
  const body = text.slice(text.indexOf("\n", start) + 1);
  const end = body.search(/^## \[/m);
  const section = (end === -1 ? body : body.slice(0, end))
    .split("\n")
    .filter((line) => !/^\[[^\]]+\]:\s*\S+/.test(line))
    .join("\n")
    .trim();
  return section;
}

/**
 * Dates the changelog for a stable release: `## [Unreleased]` becomes
 * `## [x.y.z] - YYYY-MM-DD` and a fresh empty Unreleased section goes above it.
 */
export function dateChangelog(text: string, version: string, date: string): string {
  if (!text.includes("## [Unreleased]")) {
    return text;
  }
  return text.replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - ${date}`);
}

/** GitHub's generated notes, or nothing, should be replaced with the changelog. */
export function isPlaceholderNotes(body: string | null | undefined): boolean {
  const text = (body ?? "").trim();
  return text === "" || /^##\s+What's Changed/m.test(text) || /^\*\*Full Changelog\*\*/m.test(text);
}
