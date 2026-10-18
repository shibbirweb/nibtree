// The release build of the Swift showcase, which draws and times the scenarios (--parity, --bench, --render).
import { execFileSync } from "node:child_process";
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
