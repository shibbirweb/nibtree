// Merges and rebases that stop on conflicts: Resolve Conflicts, the merge tool, Continue, Abort and Skip Commit.

import type { Group } from "./harness";

/** main and `branchName` both change notes.txt from the same commit; leaves main checked out. */
function clash(g: Group, branchName: string): void {
  g.gitIn(g.repo, ["checkout", "-q", "main"]);
  g.gitIn(g.repo, ["branch", "-f", branchName]);
  g.commitIn(g.repo, "notes.txt", `main before ${branchName}\n`, `main before ${branchName}`);
  g.gitIn(g.repo, ["checkout", "-q", branchName]);
  g.commitIn(g.repo, "notes.txt", `${branchName} side\n`, `${branchName} side`);
  g.gitIn(g.repo, ["checkout", "-q", "main"]);
}

async function mergeFromMenu(g: Group, branchName: string): Promise<void> {
  await g.reload();
  await g.menu("Merge...");
  await g.dialog().locator("input").first().fill(branchName);
  await g.press("Merge");
  await g.expect(
    `Merge... of ${branchName} stops with the conflict`,
    () => g.git(["diff", "--name-only", "--diff-filter=U"]) === "notes.txt",
  );
  await g.dismissConflictsDialog();
}

const merging = (g: Group) => g.exists(".git/MERGE_HEAD");

export async function conflicts(g: Group): Promise<void> {
  const page = g.page;

  clash(g, "clash");
  await mergeFromMenu(g, "clash");
  const labels = await g.menuLabels();
  g.check(
    "the Git menu offers Resolve Conflicts..., Continue Merge and Abort Merge",
    ["Resolve Conflicts...", "Continue Merge", "Abort Merge"].every((name) => labels.includes(name)),
    labels.join(" | "),
  );
  await g.menu("Resolve Conflicts...");
  await g.dialog().getByText("notes.txt").first().click();
  await g.press("Accept Theirs");
  await g.expect(
    "Conflicts > Accept Theirs takes their side and marks it resolved",
    () => g.read("notes.txt") === "clash side\n" && g.git(["diff", "--name-only", "--diff-filter=U"]) === "",
  );
  // The Accept button went away with the last conflict, and the focus with it; Esc must still close the dialog.
  await page.keyboard.press("Escape");
  await g.expect(
    "Esc closes the Conflicts dialog after its last conflict is resolved",
    async () => !(await g.dialogOpen()),
  );
  await g.menu("Continue Merge");
  await g.expect(
    "Git > Continue Merge commits the merge",
    () => !merging(g) && g.git(["rev-list", "--count", "--merges", "-1", "HEAD"]) === "1",
  );

  clash(g, "tool");
  await mergeFromMenu(g, "tool");
  await g.menu("Resolve Conflicts...");
  await g.dialog().getByText("notes.txt").first().click();
  await g.press("Merge...");
  // Accept Left takes the whole left side and finishes the file, closing the merge tool.
  await page.getByRole("button", { name: "Accept Left" }).click();
  await g.expect(
    "the merge tool's Accept Left writes yours and marks it resolved",
    () => g.read("notes.txt") === "main before tool\n" && g.git(["diff", "--name-only", "--diff-filter=U"]) === "",
  );
  await g.reload();
  await g.menu("Continue Merge");
  await g.expect("...and Continue Merge commits it", () => !merging(g));

  clash(g, "aborted");
  const head = g.git(["rev-parse", "HEAD"]);
  await mergeFromMenu(g, "aborted");
  await g.menu("Abort Merge");
  await g.press("Abort");
  await g.expect(
    "Git > Abort Merge (after confirming) restores the branch",
    () => !merging(g) && g.git(["rev-parse", "HEAD"]) === head,
  );

  await mergeFromMenu(g, "aborted");
  g.write("README.md", "# staged\n");
  g.gitIn(g.repo, ["add", "README.md"]);
  g.write("README.md", "# staged, then changed again\n");
  await g.reload();
  await g.menu("Abort Merge");
  await g.press("Abort");
  await g.expect("an Abort that git refuses shows git's reason", async () => /README\.md/.test(await g.toasts()));
  g.check("...and the merge is still in progress", merging(g));
  g.gitIn(g.repo, ["reset", "-q", "--hard"]);

  g.gitIn(g.repo, ["checkout", "-q", "-B", "rb", "main~1"]);
  g.commitIn(g.repo, "notes.txt", "rb side\n", "rb clashing");
  g.commitIn(g.repo, "rb.txt", "rb\n", "rb clean");
  await g.reload();
  await g.menu("Rebase...");
  await g.dialog().getByLabel("Onto branch or commit").fill("main");
  await g.press("Rebase");
  await g.expect("Rebase... stops on the clashing commit", () => g.exists(".git/rebase-merge"));
  await g.dismissConflictsDialog();
  const rebaseLabels = await g.menuLabels();
  g.check(
    "the Git menu offers Skip Commit during a rebase",
    rebaseLabels.includes("Skip Commit"),
    rebaseLabels.join(" | "),
  );
  await g.menu("Skip Commit");
  await g.expect(
    "Git > Skip Commit skips it and finishes the rebase",
    () => !g.exists(".git/rebase-merge") && g.git(["log", "-1", "--format=%s"]) === "rb clean",
  );
}
