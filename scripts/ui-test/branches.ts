// New Branch, Branches, New Tag, Merge, Rebase, Interactive Rebase, Cherry-Pick, Reset HEAD and Undo Last Action.

import type { Group } from "./harness";

export async function branchesAndHistory(g: Group): Promise<void> {
  const page = g.page;

  await g.menu("New Branch...");
  await g.dialog().locator("input").first().fill("feature-ui");
  await g.press("Create");
  await g.expect(
    "Git > New Branch... creates and checks out the branch",
    () => g.git(["branch", "--show-current"]) === "feature-ui",
  );
  g.commitIn(g.repo, "feature.txt", "feature work\n", "feature work");

  await g.reload();
  await g.menu("Branches...");
  await g.dialog().getByText("main", { exact: true }).first().click();
  await page
    .getByRole("menuitem", { name: /^Checkout$/ })
    .first()
    .click();
  await g.expect(
    "Branches... > main > Checkout switches to main",
    () => g.git(["branch", "--show-current"]) === "main",
  );

  await g.menu("New Tag...");
  const fields = g.dialog().locator("input, textarea");
  await fields.nth(0).fill("v1.0");
  await fields.nth(1).fill("first release");
  await g.press("Create Tag");
  await g.expect(
    "Git > New Tag... with a message makes an annotated tag",
    () => g.git(["cat-file", "-t", "v1.0"]) === "tag",
  );
  await g.menu("New Tag...");
  await g.dialog().locator("input").first().fill("v1.0-light");
  await g.press("Create Tag");
  await g.expect(
    "Git > New Tag... without a message makes a lightweight tag",
    () => g.git(["cat-file", "-t", "v1.0-light"]) === "commit",
  );

  await g.menu("Merge...");
  await g.dialog().locator("input").first().fill("feature-ui");
  await g.dialog().getByText("--no-ff", { exact: true }).click();
  await g.press("Merge");
  await g.expect(
    "Git > Merge... with --no-ff makes a merge commit",
    () => g.git(["rev-list", "--count", "--merges", "-1", "HEAD"]) === "1",
  );

  g.gitIn(g.repo, ["checkout", "-q", "-b", "topic", "HEAD~1"]);
  g.commitIn(g.repo, "topic.txt", "topic\n", "topic work");
  await g.reload();
  await g.menu("Rebase...");
  await g.dialog().getByLabel("Onto branch or commit").fill("main");
  await g.press("Rebase");
  await g.expect(
    "Git > Rebase... rebases the branch onto main",
    () =>
      g.git(["merge-base", "topic", "main"]) === g.git(["rev-parse", "main"]) &&
      g.git(["branch", "--show-current"]) === "topic",
  );

  g.gitIn(g.repo, ["checkout", "-q", "main"]);
  await g.reload();
  await g.menu("Cherry-Pick...");
  await g.dialog().getByText("topic work").first().click();
  await g.expect(
    "Git > Cherry-Pick... picks the clicked commit onto main",
    () => g.git(["log", "-1", "--format=%s"]) === "topic work" && g.git(["branch", "--show-current"]) === "main",
  );

  await g.menu("Interactive Rebase...");
  await g.dialog().getByText("feature work").first().click();
  await page.locator("select").last().selectOption({ label: "Drop" });
  await page.getByRole("button", { name: "Start Rebasing" }).click();
  await g.expect(
    "Interactive Rebase... drops the chosen commit and keeps the merge",
    () =>
      !g.git(["log", "--format=%s", "-6"]).split("\n").includes("topic work") &&
      g.git(["rev-list", "--count", "--merges", "-1", "HEAD"]) === "1" &&
      !g.exists(".git/rebase-merge"),
    () => g.git(["log", "--oneline", "-5"]),
  );

  const head = g.git(["rev-parse", "HEAD"]);
  const parent = g.git(["rev-parse", "HEAD~1"]);
  await g.menu("Reset HEAD...");
  await g.dialog().locator("input[type='text'], input:not([type])").first().fill("HEAD~1");
  await page.waitForTimeout(800);
  await g.dialog().getByText("Soft", { exact: true }).click();
  await g.press("Reset");
  await g.expect(
    "Git > Reset HEAD... (soft) moves back one commit and keeps the changes staged",
    () => g.git(["rev-parse", "HEAD"]) === parent && g.git(["diff", "--cached", "--name-only"]) !== "",
  );
  await g.menu("Undo Last Action...");
  await g.press("Undo");
  await g.expect("Git > Undo Last Action... undoes the reset", () => g.git(["rev-parse", "HEAD"]) === head);
}
