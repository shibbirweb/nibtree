// Git > Uncommitted Changes: stash, unstash, shelve, rollback, local changes and the selected-lines items.

import type { Group } from "./harness";

export async function uncommittedChanges(g: Group): Promise<void> {
  const page = g.page;
  const tracked = "line A\nline B\nline C\n";
  g.write("notes.txt", tracked);
  g.write("draft.txt", "untracked draft\n");
  await g.refresh();
  // The Stash dialog offers untracked files only once the page has seen one.
  await g.changes().getByText("draft.txt").first().waitFor();

  await g.menu("Uncommitted Changes", "Stash Changes...");
  await g.dialog().locator("input[type='text'], input:not([type]), textarea").first().fill("wip from the UI");
  await g.press("Stash");
  await g.expect(
    "Stash Changes... (untracked included by default) cleans the work tree",
    () => g.git(["status", "--porcelain"]) === "" && g.git(["stash", "list"]).includes("wip from the UI"),
    () => `${g.git(["status", "--porcelain"])} | ${g.git(["stash", "list"])}`,
  );
  await g.menu("Uncommitted Changes", "Unstash Changes...");
  await g.dialog().getByText("wip from the UI").first().click();
  await g.dialog().getByText("Apply", { exact: true }).click();
  await g.expect(
    "Unstash > Apply brings the changes back and keeps the stash",
    () =>
      g.read("notes.txt") === tracked && g.read("draft.txt") === "untracked draft\n" && g.git(["stash", "list"]) !== "",
  );
  g.gitIn(g.repo, ["stash", "drop", "-q"]);
  await g.refresh();
  await g.menu("Uncommitted Changes", "Stash Changes...");
  await g.dialog().locator("input[type='checkbox']").first().uncheck();
  await g.press("Stash");
  await g.expect(
    "Stash Changes... without untracked files leaves them",
    () => g.git(["status", "--porcelain"]) === "?? draft.txt",
  );
  await g.menu("Uncommitted Changes", "Unstash Changes...");
  await g.dialog().getByText("On main").first().click();
  await g.dialog().getByText("Pop", { exact: true }).click();
  await g.expect(
    "Unstash > Pop brings them back and drops the stash",
    () => g.read("notes.txt") === tracked && g.git(["stash", "list"]) === "",
  );

  await g.refresh();
  await g.menu("Uncommitted Changes", "Shelve Changes...");
  await g.dialog().locator("input[type='text'], input:not([type])").first().fill("my shelf");
  await g.press("Shelve");
  await g.expect(
    "Shelve Changes... takes the changes out of the work tree",
    () => g.git(["status", "--porcelain"]) === "",
  );
  await g.menu("Uncommitted Changes", "Show Shelf");
  await g.expect("Git > Uncommitted Changes > Show Shelf lists the shelf", () =>
    page.getByText("my shelf").first().isVisible(),
  );
  // A selected row shows its buttons without the mouse on it, so the keyboard and screen readers reach them.
  await page.getByText("my shelf").first().click();
  await page.mouse.move(1, 1);
  await g.expect("a selected shelf row shows its Unshelve button without hovering", () =>
    page.getByRole("button", { name: "Unshelve my shelf" }).isVisible(),
  );
  await page.getByText("my shelf").first().click({ button: "right" });
  await page
    .getByRole("menu")
    .last()
    .getByRole("menuitem", { name: /^Unshelve/ })
    .first()
    .click();
  await g.dialog().getByText("Unshelve", { exact: true }).click();
  await g.expect(
    "Unshelve brings the changes back",
    () => g.read("notes.txt") === tracked && g.read("draft.txt") === "untracked draft\n",
  );

  await g.waitForChange("notes.txt");
  await g.menu("Uncommitted Changes", "Rollback...");
  await g.press("Rollback");
  // The confirmation replaces the file list.
  await g.until(async () => (await g.dialogOpen()) && /cannot be undone/.test(await g.dialog().innerText()));
  await g.press("Rollback");
  await g.expect(
    "Rollback... (after confirming) reverts the tracked change",
    () => g.git(["status", "--porcelain", "--", "notes.txt"]) === "",
  );
  await g.menu("Uncommitted Changes", "Show Local Changes");
  await g.expect("Show Local Changes shows the Changes panel", () =>
    g.changes().getByText("draft.txt").first().isVisible(),
  );

  // Lines: two separate changes, so one can be staged or thrown away alone.
  g.commitIn(g.repo, "notes.txt", "one\ntwo\nthree\nfour\n", "four lines");
  g.write("notes.txt", "one EDITED\ntwo\nthree\nfour EDITED\n");
  await g.refresh();
  await g.openFile("notes.txt");
  await g.menu("Current File", "Show Diff");
  await g.clickLine("one EDITED");
  await g.menu("Uncommitted Changes", "Stage Selected Lines");
  await g.expect("Stage Selected Lines stages only the line under the caret", () => {
    const staged = g.git(["diff", "--cached", "-U0"]);
    return staged.includes("+one EDITED") && !staged.includes("four EDITED");
  });
  await g.changes().locator(".row", { hasText: "notes.txt" }).first().click();
  await page.waitForTimeout(800);
  await g.clickLine("one EDITED");
  await g.menu("Uncommitted Changes", "Unstage Selected Lines");
  await g.expect("Unstage Selected Lines (in the staged diff) unstages it", () => g.git(["diff", "--cached"]) === "");
  await g.changes().locator(".row", { hasText: "notes.txt" }).last().click();
  await page.waitForTimeout(800);
  await g.clickLine("four EDITED");
  await g.menu("Uncommitted Changes", "Discard Selected Lines...");
  await g.press("Discard");
  await g.expect(
    "Discard Selected Lines... reverts only that line",
    () => g.read("notes.txt") === "one EDITED\ntwo\nthree\nfour\n",
  );
}
