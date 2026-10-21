// Git > LFS. With git-lfs: Install Hooks, Track and Untrack Pattern, Fetch, Pull and Prune LFS Objects, against the
// local origin. Without it, every item must explain where to get it instead.

import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Group } from "./harness";

const CONTENT = "large file content\n";

export async function lfs(g: Group): Promise<void> {
  if (!g.git(["lfs", "version"]).startsWith("git-lfs")) {
    await withoutGitLfs(g);
    return;
  }
  const page = g.page;
  const objects = join(g.repo, ".git", "lfs", "objects");
  const hasObjects = () => existsSync(objects) && readdirSync(objects, { recursive: true }).length > 2;

  await g.menu("LFS", "Install Hooks");
  await g.expect("LFS > Install Hooks installs the LFS hooks in the repository", () =>
    g.read(".git/hooks/pre-push").includes("git lfs"),
  );

  await g.menu("LFS", "Track Pattern...");
  await g.dialog().locator("input").first().fill("*.bin");
  await g.press("Track");
  await g.expect("LFS > Track Pattern... adds the pattern to .gitattributes", () =>
    g.read(".gitattributes").includes("*.bin filter=lfs"),
  );

  // A tracked file, committed and pushed: its content goes to the remote's LFS store, git keeps a pointer.
  g.write("big.bin", CONTENT);
  g.gitIn(g.repo, ["add", ".gitattributes", "big.bin"]);
  g.gitIn(g.repo, ["commit", "-q", "-m", "a large file"]);
  // play starts one commit behind origin.
  g.gitIn(g.repo, ["pull", "-q", "--no-rebase"]);
  g.gitIn(g.repo, ["push", "-q"]);
  g.check("a tracked file is stored with LFS", g.git(["lfs", "ls-files", "--name-only"]) === "big.bin");

  // Lose the local copy, as a clone without git-lfs would have only the pointer.
  const pointer = g.gitIn(g.repo, ["lfs", "pointer", "--file=big.bin"]);
  rmSync(objects, { recursive: true, force: true });
  g.write("big.bin", `${pointer}\n`);
  await g.refresh();

  await g.menu("LFS", "Fetch LFS Objects");
  await g.expect("LFS > Fetch LFS Objects downloads the object without touching the file", () => hasObjects());
  g.check("...the file is still the pointer", g.read("big.bin").startsWith("version https://git-lfs"));

  await g.menu("LFS", "Pull LFS Objects");
  await g.expect("LFS > Pull LFS Objects puts the real content in the file", () => g.read("big.bin") === CONTENT);

  await g.menu("LFS", "Prune LFS Objects...");
  await g.press("Prune");
  await g.expect("LFS > Prune LFS Objects... (after confirming) prunes", async () =>
    /Pruned old LFS objects/.test(`${await g.toasts()} ${await g.notifications()}`),
  );

  await g.menu("LFS", "Untrack Pattern...");
  await page.getByText("*.bin", { exact: true }).last().click();
  await g.expect("LFS > Untrack Pattern... removes the pattern", () => !g.read(".gitattributes").includes("*.bin"));
}

async function withoutGitLfs(g: Group): Promise<void> {
  console.log(`SKIP ${g.name}: git-lfs is not installed here; only its "not installed" answer is checked`);
  for (const item of ["Track Pattern...", "Pull LFS Objects", "Install Hooks"]) {
    await g.menu("LFS", item);
    await g.expect(`LFS > ${item} without git-lfs says where to get it`, async () => {
      return (await g.dialogOpen()) && /Git LFS Is Not Installed/.test(await g.dialog().innerText());
    });
    await g.dialog().getByText("Cancel", { exact: true }).first().click();
    await g.expect(`...and Cancel closes it`, async () => !(await g.dialogOpen()));
  }
}
