/**
 * Packs and publishes the browser version's npm packages (see scripts/npmPackages.ts and npm/nibtree).
 *
 *     bun scripts/npm-package.ts pack --target <rust target> --binary <file> --page <folder> --out <folder>
 *         writes two tarballs into --out: the platform package (the program, with the page beside it in
 *         bin/page) and the launcher
 *     bun scripts/npm-package.ts publish --dir <folder> [--dry-run]
 *         publishes every tarball there that npm does not have yet, platform packages first, betas to `next`
 *
 * Publishing takes the token from NPM_CONFIG_TOKEN (the NPM_TOKEN secret, .github/workflows/browser.yml).
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { binaryName, platformForTarget } from "../npm/nibtree/lib/platforms.mjs";
import { distTag, MAIN_PACKAGE, type Manifest, manifestProblems, platformManifest, publishOrder } from "./npmPackages";
import { tarballManifest } from "./tarball";
import { cargoTomlVersion } from "./versioning";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LAUNCHER = join(ROOT, "npm", "nibtree");
const REGISTRY = "https://registry.npmjs.org";

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

const pathOption = (args: string[], name: string): string => resolve(option(args, name));

function appVersion(): string {
  const version = cargoTomlVersion(readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8"));
  if (!version) {
    throw new Error("could not read the version from src-tauri/Cargo.toml");
  }
  return version;
}

function packInto(folder: string, out: string): void {
  execFileSync(process.execPath, ["pm", "pack", "--destination", out, "--quiet"], { cwd: folder, stdio: "inherit" });
}

function pack(args: string[]): number {
  const target = option(args, "--target");
  const platform = platformForTarget(target);
  if (!platform) {
    throw new Error(`${target} is not a platform in npm/nibtree/lib/platforms.mjs`);
  }
  const [binary, page, out] = ["--binary", "--page", "--out"].map((name) => pathOption(args, name));
  if (!existsSync(join(page, "index.html"))) {
    throw new Error(`${page} has no index.html: run \`bun run build\` first`);
  }
  const version = appVersion();
  const launcher = JSON.parse(readFileSync(join(LAUNCHER, "package.json"), "utf8")) as Manifest;
  const problems = manifestProblems(launcher, version);
  if (problems.length > 0) {
    throw new Error(`npm/nibtree/package.json: ${problems.join("; ")}. Run \`bun scripts/version.ts set ${version}\`.`);
  }
  mkdirSync(out, { recursive: true });
  const stage = mkdtempSync(join(tmpdir(), "nibtree-npm-"));

  const platformFolder = join(stage, `${platform.os}-${platform.cpu}`);
  const program = join(platformFolder, "bin", binaryName(platform.os));
  mkdirSync(dirname(program), { recursive: true });
  cpSync(binary, program);
  chmodSync(program, 0o755);
  cpSync(page, join(platformFolder, "bin", "page"), { recursive: true });
  const manifest = platformManifest(platform, version);
  writeFileSync(join(platformFolder, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(platformFolder, "README.md"), `# ${manifest.name}\n\n${manifest.description}.\n`);
  packInto(platformFolder, out);

  const launcherFolder = join(stage, MAIN_PACKAGE);
  for (const entry of ["bin", "lib", "package.json", "README.md"]) {
    cpSync(join(LAUNCHER, entry), join(launcherFolder, entry), { recursive: true });
  }
  packInto(launcherFolder, out);
  return 0;
}

async function isPublished(manifest: Manifest): Promise<boolean> {
  const response = await fetch(`${REGISTRY}/${manifest.name.replace("/", "%2F")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`${REGISTRY} answered ${response.status} for ${manifest.name}`);
  }
  const document = (await response.json()) as { versions?: Record<string, unknown> };
  return manifest.version in (document.versions ?? {});
}

// `bun publish --dry-run` still refuses to run without a token, though it sends nothing. The release rehearsal
// has no NPM_TOKEN on purpose, so a dry run gets a placeholder.
function publishEnv(dryRun: boolean): NodeJS.ProcessEnv {
  if (!dryRun || process.env.NPM_CONFIG_TOKEN) {
    return process.env;
  }
  return { ...process.env, NPM_CONFIG_TOKEN: "dry-run" };
}

async function publish(args: string[]): Promise<number> {
  const folder = pathOption(args, "--dir");
  const dryRun = args.includes("--dry-run");
  const tarballs = new Map<string, { file: string; manifest: Manifest }>();
  for (const name of readdirSync(folder).filter((file) => file.endsWith(".tgz"))) {
    const file = join(folder, name);
    const manifest = tarballManifest(file) as Manifest;
    tarballs.set(manifest.name, { file, manifest });
  }
  if (!tarballs.has(MAIN_PACKAGE)) {
    throw new Error(`${folder} has no ${MAIN_PACKAGE} tarball`);
  }
  for (const name of publishOrder([...tarballs.keys()])) {
    const { file, manifest } = tarballs.get(name)!;
    if (await isPublished(manifest)) {
      console.log(`${name}@${manifest.version} is on npm already`);
      continue;
    }
    const flags = ["--access", "public", "--tag", distTag(manifest.version), ...(dryRun ? ["--dry-run"] : [])];
    console.log(`${dryRun ? "Would publish" : "Publishing"} ${name}@${manifest.version} (${flags.join(" ")})`);
    // From the launcher's folder: bun checks the launcher's `bin` entry against the current folder.
    execFileSync(process.execPath, ["publish", file, ...flags], {
      cwd: LAUNCHER,
      stdio: "inherit",
      env: publishEnv(dryRun),
    });
  }
  return 0;
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "pack") {
    process.exit(pack(args));
  } else if (command === "publish") {
    process.exit(await publish(args));
  }
  console.error("usage: bun scripts/npm-package.ts pack|publish ... (see the top of scripts/npm-package.ts)");
  process.exit(2);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
