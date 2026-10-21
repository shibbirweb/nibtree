/**
 * Finishes the Linux .deb that `bun run tauri build` made (linux-packages.yml and build-linux in release.yml run it).
 *
 *     bun scripts/deb-package.ts <file.deb>...
 *
 * Tauri writes the version as it is (`0.2.0-beta.1`), which apt would sort above the stable `0.2.0`; Tauri only
 * takes semver, so the Debian form (`0.2.0~beta.1`, `debianVersion`) is written here into each package's control
 * file. Then every package is checked: version, maintainer with an email, long description and homepage.
 * Needs dpkg-deb, so it runs on Linux only.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { controlProblems, setControlVersion } from "./debPackage";
import { cargoTomlVersion, debianVersion } from "./versioning";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const debs = process.argv.slice(2);
if (debs.length === 0) {
  console.error("usage: bun scripts/deb-package.ts <file.deb>...");
  process.exit(2);
}
const version = cargoTomlVersion(readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8"));
if (!version) {
  console.error("src-tauri/Cargo.toml has no package version");
  process.exit(1);
}
const wanted = debianVersion(version);

let failed = false;
for (const deb of debs) {
  const work = mkdtempSync(join(tmpdir(), "deb-package-"));
  try {
    execFileSync("dpkg-deb", ["--raw-extract", deb, work]);
    const controlPath = join(work, "DEBIAN", "control");
    const control = setControlVersion(readFileSync(controlPath, "utf8"), wanted);
    if (!control) {
      throw new Error(`${deb} has no Version field`);
    }
    writeFileSync(controlPath, control);
    // Files in a package belong to root, whoever builds it.
    execFileSync("dpkg-deb", ["--root-owner-group", "--build", work, deb], { stdio: "ignore" });
    const shipped = execFileSync("dpkg-deb", ["--field", deb], { encoding: "utf8" });
    console.log(`${deb}\n${shipped}`);
    const problems = controlProblems(shipped, wanted);
    for (const problem of problems) {
      console.error(`::error::${deb}: ${problem}`);
    }
    failed ||= problems.length > 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
