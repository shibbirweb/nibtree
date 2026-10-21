// Commit, Fetch, Pull, Push, Force Push, Update Project and remotes, through the Git menu.

import type { Group } from "./harness";

export async function commitAndSync(g: Group): Promise<void> {
  const page = g.page;
  g.write("notes.txt", "line 1\nline 2 changed\nline 3\n");
  g.write("new.txt", "brand new\n");
  await g.refresh();

  await g.menu("Commit...");
  await g.expect(
    "Git > Commit... puts the caret in the commit message",
    async () => (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Commit message",
  );
  await page.keyboard.type("edit notes from the Commit menu");
  for (const [index, file] of ["notes.txt", "new.txt"].entries()) {
    const row = g.changes().locator(".row", { hasText: file }).last();
    const stage = row.getByRole("button", { name: "Stage", exact: true });
    // The list redraws as files move to Staged; hover until the row shows its button again.
    await g.until(async () => {
      await row.hover();
      return stage.isVisible();
    });
    await stage.click();
    // The list redraws after each stage; the next row is clicked only once git has the file.
    await g.until(() => g.git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean).length === index + 1);
  }
  await g.expect(
    "row Stage buttons stage both files",
    () => g.git(["diff", "--cached", "--name-only"]).split("\n").length === 2,
  );
  await g.changes().locator("button.primary").first().click();
  await g.expect(
    "Commit commits with the typed message",
    () =>
      g.git(["log", "-1", "--format=%s"]) === "edit notes from the Commit menu" &&
      g.git(["status", "--porcelain"]) === "",
    () => g.git(["status", "--porcelain"]),
  );

  const remoteHead = g.remoteCommit("second remote commit");
  await g.menu("Fetch");
  await g.expect("Git > Fetch updates origin/main", () => g.git(["rev-parse", "origin/main"]) === remoteHead);

  const before = g.git(["rev-parse", "HEAD"]);
  await g.menu(/^Pull/);
  await g.dialog().getByText("Fast-forward only", { exact: true }).click();
  await g.press("Pull");
  await g.expect("Pull with Fast-forward only on a diverged branch says why", async () =>
    /fast-forward|diverg/i.test(await g.toasts()),
  );
  g.check("...and changes nothing", g.git(["rev-parse", "HEAD"]) === before);
  await g.closeMenus();
  await g.menu(/^Pull/);
  await g.dialog().getByText("Rebase", { exact: true }).click();
  await g.press("Pull");
  await g.expect(
    "Pull with Rebase puts the local commit on top, without a merge",
    () =>
      g.git(["merge-base", "HEAD", "origin/main"]) === g.git(["rev-parse", "origin/main"]) &&
      g.git(["rev-list", "--merges", "--count", "origin/main..HEAD"]) === "0",
  );

  await g.menu(/^Push/);
  await g.press("Push");
  await g.expect(
    "Git > Push... pushes the branch",
    () => g.git(["rev-parse", "main"], g.origin) === g.git(["rev-parse", "HEAD"]),
  );

  g.gitIn(g.repo, ["commit", "-q", "--amend", "-m", "edit notes, rewritten"]);
  await g.reload();
  await g.menu("Force Push...");
  await g.press("Force Push");
  await g.expect(
    "Git > Force Push... overwrites the remote branch",
    () => g.git(["log", "-1", "--format=%s", "main"], g.origin) === "edit notes, rewritten",
  );

  const third = g.remoteCommit("third remote commit");
  await g.menu("Update Project...");
  await g.press("Update");
  await g.expect("Git > Update Project... brings in the remote commit", () =>
    g.git(["log", "--format=%H"]).includes(third),
  );

  g.gitIn(g.root, ["init", "-q", "--bare", "backup.git"]);
  await g.menu("Manage Remotes...");
  await g.press("Add Remote...");
  const inputs = g.dialog().locator("input");
  await inputs.nth(0).fill("backup");
  await inputs.nth(1).fill(`${g.root}/backup.git`);
  await g.press("Add");
  await g.expect(
    "Manage Remotes > Add Remote adds it",
    () => g.git(["remote", "get-url", "backup"]) === `${g.root}/backup.git`,
  );
  await g.closeMenus();
  await page.keyboard.press("Escape");

  g.gitIn(g.repo, ["push", "-q", "backup", "main:from-backup"]);
  g.gitIn(g.repo, ["update-ref", "-d", "refs/remotes/backup/from-backup"]);
  await g.menu("Fetch All Remotes");
  await g.expect(
    "Git > Fetch All Remotes fetches every remote",
    () => g.git(["rev-parse", "--verify", "-q", "refs/remotes/backup/from-backup"]).length === 40,
  );
}
