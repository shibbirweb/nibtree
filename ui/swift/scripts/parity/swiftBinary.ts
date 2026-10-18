// The release build of the Swift showcase, which draws and times the scenarios (--parity, --bench, --render).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Builds NibtreeShowcase in release (the build's own output goes to the terminal) and returns its path. */
export function swiftBinary(swiftRoot: string, quiet = false): string {
  execFileSync("swift", ["build", "-c", "release", "--product", "NibtreeShowcase"], {
    cwd: swiftRoot,
    stdio: quiet ? "pipe" : "inherit",
  });
  const bin = execFileSync("swift", ["build", "-c", "release", "--show-bin-path"], { cwd: swiftRoot })
    .toString()
    .trim();
  return join(bin, "NibtreeShowcase");
}

/** Every Swift file of the parity harness, joined: the `case "<Component>":` that read each component's props live in
 *  ScenarioView.swift and one file per library group under Parity/Groups. */
export function harnessSource(swiftRoot: string): string {
  const parity = join(swiftRoot, "Sources/NibtreeShowcase/Parity");
  const groups = join(parity, "Groups");
  const files = [
    join(parity, "ScenarioView.swift"),
    ...readdirSync(groups)
      .filter((name) => name.endsWith(".swift"))
      .map((name) => join(groups, name)),
  ];
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}
