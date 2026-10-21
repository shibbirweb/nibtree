import { describe, expect, it } from "vitest";
import {
  cargoLockVersion,
  cargoTomlVersion,
  changelogSection,
  dateChangelog,
  debianVersion,
  isPlaceholderNotes,
  nextTicket,
  nextVersion,
  setCargoLockVersion,
  setCargoTomlVersion,
  suggestLevel,
  untriedSubjects,
} from "./versioning";

const cargoToml = `[package]
name = "nibtree"
version = "0.3.1"

[dependencies]
serde = { version = "1", features = ["derive"] }
`;

describe("Cargo files", () => {
  it("reads and writes only the package version", () => {
    expect(cargoTomlVersion(cargoToml)).toBe("0.3.1");
    const updated = setCargoTomlVersion(cargoToml, "0.4.0-beta.1") ?? "";
    expect(cargoTomlVersion(updated)).toBe("0.4.0-beta.1");
    expect(updated).toContain('serde = { version = "1"');
  });

  it("finds the crate in Cargo.lock", () => {
    const lock = `[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "nibtree"\nversion = "0.3.1"\n`;
    expect(cargoLockVersion(lock, "nibtree")).toBe("0.3.1");
    expect(cargoLockVersion(lock, "missing")).toBeNull();
  });

  it("rewrites only the crate's own Cargo.lock entry", () => {
    const lock = `[[package]]\nname = "nibtree"\nversion = "0.3.1"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "serde"\nversion = "0.3.1"\n`;
    const updated = setCargoLockVersion(lock, "nibtree", "0.4.0-beta.1") ?? "";
    expect(cargoLockVersion(updated, "nibtree")).toBe("0.4.0-beta.1");
    expect(cargoLockVersion(updated, "serde")).toBe("0.3.1");
    expect(setCargoLockVersion(lock, "missing", "1.0.0")).toBeNull();
  });
});

describe("next versions", () => {
  it("bumps stable versions and starts betas", () => {
    expect(nextVersion("0.3.1", "patch")).toBe("0.3.2");
    expect(nextVersion("0.3.1", "minor")).toBe("0.4.0");
    expect(nextVersion("0.3.1", "major")).toBe("1.0.0");
    expect(nextVersion("0.3.1", "beta")).toBe("0.4.0-beta.1");
    expect(nextVersion("0.3.1", "beta", "patch")).toBe("0.3.2-beta.1");
    expect(nextVersion("0.3.1", "release")).toBeNull();
  });

  it("moves a beta on or finishes it", () => {
    expect(nextVersion("0.4.0-beta.1", "beta")).toBe("0.4.0-beta.2");
    expect(nextVersion("0.4.0-beta.2", "release")).toBe("0.4.0");
    expect(nextVersion("0.4.0-beta.2", "minor")).toBeNull();
  });

  it("suggests a level from commit subjects", () => {
    expect(suggestLevel(["fix:[GM-2] a", "feat:[GM-3] b"])).toBe("minor");
    expect(suggestLevel(["fix:[GM-2] a", "docs: c"])).toBe("patch");
    expect(suggestLevel(["feat!:[GM-4] drop the old settings file", "fix:[GM-5] x"])).toBe("major");
    expect(suggestLevel(["feat(merge):[GM-6] y"])).toBe("minor");
  });
});

describe("release workflow helpers", () => {
  it("counts only commits that change the program as untried", () => {
    const subjects = [
      "chore:[GM-7] release 0.4.0-beta.1",
      "docs:[GM-8] readme",
      "test:[GM-9] more",
      "fix:[GM-10] crash",
    ];
    expect(untriedSubjects(subjects)).toEqual(["fix:[GM-10] crash"]);
    expect(untriedSubjects(subjects.slice(0, 3))).toEqual([]);
  });

  it("numbers the next ticket past the highest one used", () => {
    expect(nextTicket(["feat:[GM-3] a", "fix:[GM-12] b", "chore:[OAR-40] c"], "GM")).toBe(13);
    expect(nextTicket(["Initial commit"], "GM")).toBe(1);
  });
});

describe("changelog", () => {
  const text =
    "# Changelog\n\n## [Unreleased]\n\n### Added\n- New.\n\n## [0.3.1] - 2026-09-01\n\n- Old.\n\n[0.3.1]: https://x/y\n";

  it("returns sections without link definitions", () => {
    expect(changelogSection(text)).toBe("### Added\n- New.");
    expect(changelogSection(text, "v0.3.1")).toBe("- Old.");
    expect(changelogSection(text, "9.9.9")).toBeNull();
  });

  it("dates Unreleased and leaves a fresh one", () => {
    const dated = dateChangelog(text, "0.4.0", "2026-10-02");
    expect(dated).toContain("## [Unreleased]\n\n## [0.4.0] - 2026-10-02\n\n### Added\n- New.");
    expect(changelogSection(dated)).toBe("");
    expect(changelogSection(dated, "0.4.0")).toBe("### Added\n- New.");
  });

  it("recognizes notes that should be replaced", () => {
    expect(isPlaceholderNotes("")).toBe(true);
    expect(isPlaceholderNotes("## What's Changed\n* thing by @me")).toBe(true);
    expect(isPlaceholderNotes("**Full Changelog**: https://x")).toBe(true);
    expect(isPlaceholderNotes("### Added\n- Real notes.")).toBe(false);
  });
});

describe("debianVersion", () => {
  it("writes a pre-release with a tilde so it sorts before its stable release", () => {
    expect(debianVersion("0.2.0-beta.1")).toBe("0.2.0~beta.1");
    expect(debianVersion("1.0.0-rc-2")).toBe("1.0.0~rc.2");
    expect(debianVersion("0.2.0")).toBe("0.2.0");
  });
});
