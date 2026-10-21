// Git > Worktrees, Submodules and Clone....

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Group } from "./harness";

export async function worktreesSubmodulesClone(g: Group): Promise<void> {
  const page = g.page;
  const worktree = join(g.root, "play-wt");

  await g.menu("Worktrees", "New Worktree...");
  const texts = g.dialog().locator("input[type='text']");
  await texts.nth(0).fill("wt-ui");
  await texts.nth(1).fill(worktree);
  for (const box of await g.dialog().locator("input[type='checkbox']").all()) {
    if (await box.isChecked()) {
      await box.uncheck();
    }
  }
  await g.press("Create");
  await g.expect(
    "Worktrees > New Worktree... creates a worktree on a new branch",
    () => g.git(["rev-parse", "--abbrev-ref", "HEAD"], worktree) === "wt-ui",
  );
  await g.menu("Worktrees", "Show Worktrees");
  await g.expect("Worktrees > Show Worktrees lists it", () => page.getByText("play-wt").first().isVisible());

  const stale = join(g.root, "stale-wt");
  g.gitIn(g.repo, ["worktree", "add", "-q", stale, "-b", "stale"]);
  rmSync(stale, { recursive: true, force: true });
  await g.menu("Worktrees", "Prune Stale Worktrees");
  if (await g.dialogOpen()) {
    await g.press(/^Prune/);
  }
  await g.expect(
    "Worktrees > Prune Stale Worktrees removes the missing one",
    () => !g.git(["worktree", "list"]).includes("stale-wt"),
  );

  const library = join(g.root, "library");
  g.gitIn(g.root, ["init", "-q", "library"]);
  g.commitIn(library, "lib.txt", "v1\n", "lib v1");
  await g.menu("Submodules", "Add Submodule...");
  const fields = g.dialog().locator("input[type='text']");
  await fields.nth(0).fill(library);
  await fields.nth(1).fill("vendor/lib");
  await g.press("Add");
  await g.expect(
    "Submodules > Add Submodule... adds it",
    () => g.exists("vendor/lib/lib.txt") && g.exists(".gitmodules"),
  );
  g.gitIn(g.repo, ["commit", "-q", "-m", "add submodule"]);
  g.commitIn(library, "lib.txt", "v2\n", "lib v2");
  await g.menu("Submodules", "Update to Latest Remote");
  await g.expect(
    "Submodules > Update to Latest Remote moves it to the library's newest commit",
    () => g.git(["rev-parse", "HEAD"], join(g.repo, "vendor/lib")) === g.git(["rev-parse", "HEAD"], library),
  );
  for (const item of ["Sync URLs", "Init Submodules", "Update Submodules"]) {
    await g.menu("Submodules", item);
    await page.waitForTimeout(1500);
    g.check(`Submodules > ${item} runs without an error`, !/error|failed/i.test(await g.toasts()), await g.toasts());
  }
  await g.menu("Submodules", "Remove Submodule...");
  if (await g.dialog().getByText("vendor/lib").count()) {
    await g.dialog().getByText("vendor/lib").first().click();
  }
  await g.press("Remove");
  await g.expect("Submodules > Remove Submodule... removes it", () => !g.exists("vendor/lib/lib.txt"));

  const clones = join(g.root, "clones");
  mkdirSync(clones);
  await g.menu("Clone...");
  const clone = g.dialog().locator("input[type='text']");
  await clone.nth(0).fill(g.origin);
  await clone.nth(1).fill(clones);
  await clone.nth(2).fill("ui-clone");
  await g.press("Clone");
  await g.expect(
    "Git > Clone... clones the repository",
    () => g.git(["rev-parse", "HEAD"], join(clones, "ui-clone")) === g.git(["rev-parse", "main"], g.origin),
  );
}
