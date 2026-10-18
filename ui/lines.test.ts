// The repository's line standard for everything in ui/: at most 120 columns per line and 300 lines per file,
// hand-written and generated alike. Generated component tokens split into numbered files to stay within it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const uiRoot = __dirname;
const CHECKED = /\.(ts|svelte|json|css|md|swift|xaml|html)$/;
const SKIPPED = new Set([".parity", "node_modules", ".build", ".swiftpm"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIPPED.has(name)) {
      return [];
    }
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : CHECKED.test(name) ? [path] : [];
  });
}

describe("the line standard", () => {
  const all = files(uiRoot);

  it("checks the whole ui folder", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("keeps every file within 300 lines", () => {
    const long = all
      .map((path) => [relative(uiRoot, path), readFileSync(path, "utf8").split("\n").length] as const)
      .filter(([, count]) => count > 301);
    expect(long).toEqual([]);
  });

  it("keeps every line within 120 columns", () => {
    const wide = all.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => [relative(uiRoot, path), index + 1, line.length] as const)
        .filter(([, , length]) => length > 120),
    );
    expect(wide).toEqual([]);
  });
});
