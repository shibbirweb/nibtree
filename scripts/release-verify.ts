/**
 * Checks a published release of the browser version from the outside, the way people get it
 * (.github/workflows/browser.yml runs it after publishing):
 *
 *     bun scripts/release-verify.ts npm <version>
 *         npm lists the launcher and every platform package at <version>, its dist-tag (next or latest) points
 *         there, and `npx nibtree@<version> --version` and `npx nibtree@<tag> --version` print it
 *     bun scripts/release-verify.ts docker <version> <repository ...>
 *         each repository has <version> for amd64 and arm64, and `docker run` of it and of the moving tag prints it
 *
 * A registry takes a while to serve a new version everywhere, so the checks keep retrying for up to half an hour.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageName, PLATFORMS } from "../npm/nibtree/lib/platforms.mjs";
import { dockerPlatforms, dockerTags, imagePlatforms } from "./dockerImage";
import { distTag, MAIN_PACKAGE } from "./npmPackages";

// npm lists a version from seconds to over ten minutes after `npm publish` returns (beta.14's launcher took 11), so
// the checks share one half-hour limit: the first one waits out the registry, the rest then pass at once.
const GIVE_UP_AT = Date.now() + 30 * 60_000;
const WAIT_MS = 30_000;

function run(program: string, args: string[], cwd?: string): string {
  // npx is npx.cmd on Windows, which only a shell finds.
  return execFileSync(program, args, { encoding: "utf8", shell: process.platform === "win32", cwd }).trim();
}

async function retry(label: string, check: () => Promise<void> | void): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await check();
      console.log(`ok: ${label}`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      if (Date.now() + WAIT_MS > GIVE_UP_AT) {
        throw new Error(`${label}: ${message} (gave up after ${attempt} tries)`);
      }
      console.log(`waiting (try ${attempt}): ${label}: ${message}`);
      await new Promise((done) => setTimeout(done, WAIT_MS));
    }
  }
}

function expect(actual: string, wanted: string, what: string): void {
  if (actual !== wanted) {
    throw new Error(`${what} is "${actual}", not "${wanted}"`);
  }
}

async function npm(version: string): Promise<void> {
  const tag = distTag(version);
  for (const name of [...PLATFORMS.map(packageName), MAIN_PACKAGE]) {
    await retry(`${name}@${version} is on npm`, async () => {
      const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
      const document = (await response.json()) as { versions?: Record<string, unknown> };
      if (!(version in (document.versions ?? {}))) {
        throw new Error("not listed yet");
      }
    });
  }
  await retry(`npm's ${tag} tag points at ${version}`, async () => {
    const response = await fetch(`https://registry.npmjs.org/-/package/${MAIN_PACKAGE}/dist-tags`);
    expect(String(((await response.json()) as Record<string, string>)[tag]), version, `the ${tag} tag`);
  });
  // Never from the checkout: its package.json is also named nibtree at this very version, so npx would take the
  // repository for the package and find no command in it ("could not determine executable to run").
  const outside = mkdtempSync(join(tmpdir(), "nibtree-npx-"));
  for (const spec of [version, tag]) {
    await retry(`npx nibtree@${spec} starts ${version}`, () => {
      expect(run("npx", ["--yes", `${MAIN_PACKAGE}@${spec}`, "--version"], outside), `nibtree ${version}`, "--version");
    });
  }
}

async function docker(version: string, repositories: string[]): Promise<void> {
  const wanted = dockerPlatforms().split(",");
  for (const repository of repositories) {
    const image = `${repository}:${version}`;
    await retry(`${image} has ${wanted.join(" and ")}`, () => {
      const found = imagePlatforms(run("docker", ["buildx", "imagetools", "inspect", "--raw", image]));
      const missing = wanted.filter((platform) => !found.includes(platform));
      if (missing.length > 0) {
        throw new Error(`missing ${missing.join(", ")}`);
      }
    });
    for (const tagged of dockerTags(version, [repository])) {
      await retry(`docker run ${tagged} starts ${version}`, () => {
        run("docker", ["pull", "--quiet", tagged]);
        expect(run("docker", ["run", "--rm", tagged, "--version"]), `nibtree ${version}`, "--version");
      });
    }
  }
}

const [command, version, ...repositories] = process.argv.slice(2);
try {
  if (command === "npm" && version) {
    await npm(version);
  } else if (command === "docker" && version && repositories.length > 0) {
    await docker(version, repositories);
  } else {
    console.error("usage: bun scripts/release-verify.ts npm <version> | docker <version> <repository ...>");
    process.exit(2);
  }
} catch (err) {
  console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
