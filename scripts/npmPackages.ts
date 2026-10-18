/**
 * The browser version's npm packages (pure logic for scripts/npm-package.ts and scripts/version.ts).
 *
 * `nibtree` (npm/nibtree) is a small launcher; it lists one optional dependency per platform, each carrying the
 * nibtree-browser program and the page. Every package has the app's version, so a launcher always starts the
 * program that was built with it.
 */
import { packageName, PLATFORMS, type Platform } from "../npm/nibtree/lib/platforms.mjs";

export const MAIN_PACKAGE = "nibtree";

export interface Manifest {
  name: string;
  version: string;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** The package.json of one platform's package. */
export function platformManifest(platform: Platform, version: string): Manifest {
  return {
    name: packageName(platform),
    version,
    description: `The nibtree-browser program for ${platform.title}, started by the nibtree package`,
    homepage: "https://github.com/shibbirweb/nibtree#readme",
    repository: { type: "git", url: "git+https://github.com/shibbirweb/nibtree.git" },
    license: "MIT",
    os: [platform.os],
    cpu: [platform.cpu],
    ...(platform.os === "linux" ? { libc: ["glibc"] } : {}),
    files: ["bin"],
    preferUnplugged: true,
  };
}

/** npm's dist-tag for a version: betas go to `next`, so `npx nibtree` keeps giving the stable release. */
export function distTag(version: string): "next" | "latest" {
  return version.includes("-") ? "next" : "latest";
}

/** The launcher's manifest at `version`, with every platform package pinned to it. */
export function withVersion(manifest: Manifest, version: string): Manifest {
  const optionalDependencies = Object.fromEntries(PLATFORMS.map((platform) => [packageName(platform), version]));
  return { ...manifest, version, optionalDependencies };
}

/** What is wrong with the launcher's manifest for `version`; empty when it is right. */
export function manifestProblems(manifest: Manifest, version: string): string[] {
  const problems: string[] = [];
  if (manifest.name !== MAIN_PACKAGE) {
    problems.push(`its name is ${manifest.name}, not ${MAIN_PACKAGE}`);
  }
  if (manifest.version !== version) {
    problems.push(`its version is ${manifest.version}, not ${version}`);
  }
  const listed = manifest.optionalDependencies ?? {};
  for (const platform of PLATFORMS) {
    const name = packageName(platform);
    if (listed[name] !== version) {
      problems.push(`${name} should be ${version}, found ${listed[name] ?? "nothing"}`);
    }
  }
  const known = new Set(PLATFORMS.map(packageName));
  for (const name of Object.keys(listed)) {
    if (!known.has(name)) {
      problems.push(`${name} is not a platform in npm/nibtree/lib/platforms.mjs`);
    }
  }
  return problems;
}

/** Platform packages first: the launcher must never be published while the programs it pins are missing. */
export function publishOrder(names: string[]): string[] {
  return [...names.filter((name) => name !== MAIN_PACKAGE), ...names.filter((name) => name === MAIN_PACKAGE)];
}
