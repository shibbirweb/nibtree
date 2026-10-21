#!/usr/bin/env bun
/**
 * The Git menu UI tests: every Git menu item and its dialog, clicked in the browser version's page by Playwright,
 * each result checked with plain git (.github/workflows/browser.yml runs them on Linux).
 *
 *     bun scripts/ui-test.ts [--binary <nibtree-browser>] [--assets <page folder>] [--browser chromium|webkit]
 *                            [group ...]
 *
 * Build first: `bun run build` (the page) and `cargo build -p nibtree-browser` (the server); once,
 * `bunx playwright install chromium`. Each group gets new repositories in a temporary folder, its own home folder
 * (so your settings and git config are never touched) and its own server. A page error fails the run too.
 * See docs/wiki/developer/Git-Menu-UI-Tests.md.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit, type Browser } from "playwright";
import { branchesAndHistory } from "./ui-test/branches";
import { uncommittedChanges } from "./ui-test/changes";
import { conflicts } from "./ui-test/conflicts";
import { currentFile, historyAndPatches } from "./ui-test/files";
import { Group, type Options } from "./ui-test/harness";
import { lfs } from "./ui-test/lfs";
import { worktreesSubmodulesClone } from "./ui-test/repos";
import { commitAndSync } from "./ui-test/sync";

const GROUPS: Record<string, (group: Group) => Promise<void>> = {
  sync: commitAndSync,
  branches: branchesAndHistory,
  conflicts,
  changes: uncommittedChanges,
  "current-file": currentFile,
  history: historyAndPatches,
  repos: worktreesSubmodulesClone,
  lfs,
};

const ROOT = join(import.meta.dir, "..");
/** Where a group that fails leaves a screenshot of the page (CI keeps the folder). */
const SHOTS = join(ROOT, "ui-test-failures");
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args.splice(index, 2)[1] : fallback;
};
const exe = process.platform === "win32" ? ".exe" : "";
const options: Options = {
  binary: option("--binary", join(ROOT, `src-tauri/target/debug/nibtree-browser${exe}`)),
  assets: option("--assets", join(ROOT, "build")),
};
const engine = option("--browser", "chromium");
const chosen = args.length > 0 ? args : Object.keys(GROUPS);

for (const path of [options.binary, options.assets]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}: build the page (bun run build) and nibtree-browser (cargo build) first.`);
    process.exit(2);
  }
}
const unknown = chosen.filter((name) => !GROUPS[name]);
if (unknown.length > 0) {
  console.error(`Unknown group ${unknown.join(", ")}; the groups are ${Object.keys(GROUPS).join(", ")}.`);
  process.exit(2);
}

const browser: Browser = await (engine === "webkit" ? webkit : chromium).launch();
// Chromium lets a test grant the clipboard; WebKit does not, so the clipboard check is skipped there.
const permissions = engine === "chromium" ? ["clipboard-read", "clipboard-write"] : [];
const failures: string[] = [];
for (const name of chosen) {
  const group = new Group(name);
  try {
    await group.open(browser, options, permissions);
    await GROUPS[name](group);
  } catch (error) {
    // Playwright's first lines name the action and the element it waited for.
    const lines = (error as Error).message.split("\n");
    const waited = lines.find((line) => line.includes("waiting for")) ?? "";
    group.check("finished without an error", false, `${lines[0]} ${waited.replace(/\x1b\[[0-9;]*m/g, "").trim()}`);
    mkdirSync(SHOTS, { recursive: true });
    await group.page?.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => undefined);
  } finally {
    failures.push(...group.failures);
    await group.close();
  }
}
await browser.close();

if (failures.length > 0) {
  console.log(`\n${failures.length} failed:\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`\nEvery Git menu check passed (${chosen.join(", ")}).`);
