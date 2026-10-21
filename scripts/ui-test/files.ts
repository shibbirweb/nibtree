// Git > Current File, Show Git Log, Show Reflog, Bisect and Patch.

import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Group } from "./harness";

/** Every .patch file under a folder, to say where a patch went when it is not where it should be. */
const patchFilesIn = (folder: string) =>
  (readdirSync(folder, { recursive: true }) as string[]).filter((name) => name.endsWith(".patch"));

const tabs = async (g: Group) =>
  (await g.page.getByRole("tab").allInnerTexts()).map((text) => text.replace(/\s+/g, " ")).join(" | ");

export async function currentFile(g: Group): Promise<void> {
  const page = g.page;
  g.write("draft.txt", "untracked draft\n");
  g.write("notes.txt", "line 1 changed\nline 2\nline 3\n");
  await g.refresh();
  await g.openFile("draft.txt");
  await g.menu("Current File", "Add to Git");
  await g.expect(
    "Current File > Add to Git stages an untracked file",
    () => g.git(["diff", "--cached", "--name-only"]) === "draft.txt",
  );

  await g.openFile("notes.txt");
  await g.menu("Current File", "Commit File...");
  await g.dialog().locator("input, textarea").first().fill("commit only notes");
  await g.press("Commit");
  await g.expect(
    "Current File > Commit File... commits only that file",
    () =>
      g.git(["show", "--name-only", "--format=", "HEAD"]) === "notes.txt" &&
      g.git(["diff", "--cached", "--name-only"]) === "draft.txt",
  );

  await g.openFile("notes.txt");
  await g.menu("Current File", "Compare with Revision...");
  await g.dialog().getByText("first commit").first().click();
  await g.expect("Compare with Revision... opens a diff with that commit", async () =>
    / vs [0-9a-f]{7,}/.test(await tabs(g)),
  );
  g.gitIn(g.repo, ["branch", "older", "HEAD~1"]);
  await g.reload();
  await g.openFile("notes.txt");
  await g.menu("Current File", "Compare with Branch...");
  await g.dialog().getByText("older", { exact: true }).first().click();
  await g.expect("Compare with Branch... opens a diff with that branch", async () => /older/.test(await tabs(g)));

  await g.openFile("notes.txt");
  await g.menu("Current File", "Show History");
  await g.expect("Current File > Show History opens the file's history", async () => /History/.test(await tabs(g)));
  await g.openFile("notes.txt");
  await g.clickLine("line 1 changed");
  await page.keyboard.press("Shift+End");
  await g.menu("Current File", "Show History for Selection");
  await g.expect(
    "Show History for Selection opens the line history",
    async () => (await tabs(g)).split("History").length > 2,
  );

  g.write("notes.txt", "rolled back soon\n");
  await g.waitForChange("notes.txt");
  await g.openFile("notes.txt");
  await g.menu("Current File", "Rollback File...");
  await g.press("Rollback");
  await g.expect(
    "Current File > Rollback File... reverts the file",
    () => g.git(["status", "--porcelain", "--", "notes.txt"]) === "",
  );
}

export async function historyAndPatches(g: Group): Promise<void> {
  const page = g.page;
  for (let n = 1; n <= 4; n++) {
    g.commitIn(g.repo, `step${n}.txt`, `${n}\n`, `step ${n}`);
  }
  await g.reload();
  await g.menu("Show Git Log");
  await g.expect("Git > Show Git Log lists the commits", () => page.getByText("step 4").first().isVisible());
  await g.menu("Show Reflog");
  await g.expect("Git > Show Reflog opens the reflog", async () => /Reflog/.test(await tabs(g)));

  await g.menu("Bisect", "Start...");
  await g.dialog().getByText("Current commit (HEAD)").first().click();
  await g.dialog().getByText("first commit").first().click();
  await g.expect("Bisect > Start... starts a bisect", () => g.exists(".git/BISECT_LOG"));
  // The "bug" came in with step 3. Each mark is clicked once and counted in git's bisect log: a click retried after
  // a "Wait for" toast could mark the next commit with this one's answer, and git then never finds the culprit.
  const marks: string[] = [];
  const marked = () =>
    g
      .git(["bisect", "log"])
      .split("\n")
      .filter((line) => /^git bisect (good|bad) /.test(line));
  const found = () => g.git(["bisect", "log"]).includes("first bad commit");
  for (let n = 0; n < 10 && !found(); n++) {
    const bad = g.exists("step3.txt");
    const before = { head: g.git(["rev-parse", "HEAD"]), marks: marked().length };
    marks.push(`${g.git(["log", "-1", "--format=%s"])}: ${bad ? "bad" : "good"}`);
    await g.menuOnce("Bisect", bad ? "Mark Bad" : "Mark Good");
    // A click refused while git is busy leaves the log as it was, and the next round tries again. Once git took
    // the mark, wait for it to check out the next commit before judging that one.
    if (await g.until(() => marked().length > before.marks)) {
      await g.until(() => found() || g.git(["rev-parse", "HEAD"]) !== before.head);
    }
  }
  await g.expect(
    "Bisect > Mark Good and Mark Bad find the first bad commit",
    () => g.git(["bisect", "log"]).includes("first bad commit"),
    () => `marked ${marks.join(", ")}; git bisect log: ${g.git(["bisect", "log"]).replace(/\n/g, " / ")}`,
  );
  await g.menu("Bisect", "Reset");
  await g.expect(
    "Bisect > Reset ends the bisect",
    () => !g.exists(".git/BISECT_LOG") && g.git(["branch", "--show-current"]) === "main",
  );

  const patches = join(g.root, "patches");
  mkdirSync(patches);
  // Typed without Enter, as people do: Save (or Open) goes to that folder first.
  const saveIn = async (folder: string) => {
    const box = g.dialog().getByRole("textbox", { name: "Folder" });
    // The picker opens on a folder it loads first; typing before that would be overwritten.
    await g.until(async () => (await box.inputValue()) !== "", 5000);
    await box.fill(folder);
  };
  g.write("notes.txt", "patch me\n");
  await g.refresh();
  await g.menu("Patch", "Create Patch...");
  await g.dialog().getByText("All changes", { exact: true }).click();
  await saveIn(patches);
  await g.press("Save");
  const patchFile = join(patches, "play-all.patch");
  await g.expect(
    "Patch > Create Patch... saves the changes",
    () => readdirSync(patches).includes("play-all.patch"),
    () => `saved: ${patchFilesIn(g.root).join(", ")}`,
  );
  g.check("...as a patch of them", readFileSync(patchFile, "utf8").includes("+patch me"));
  g.gitIn(g.repo, ["checkout", "--", "notes.txt"]);
  await g.refresh();
  await g.menu("Patch", "Apply Patch...");
  const folderBox = g.dialog().getByRole("textbox", { name: "Folder" });
  await g.until(async () => (await folderBox.inputValue()) !== "", 5000);
  await folderBox.fill(patches);
  await folderBox.press("Enter");
  await g.dialog().getByText("play-all.patch").first().click();
  await g.press("Open");
  await g.expect("Patch > Apply Patch... puts the changes back", () => g.read("notes.txt") === "patch me\n");

  await g.menu("Patch", "Create Patch from Commit...");
  await g.dialog().getByText("step 2").first().click();
  await saveIn(patches);
  await g.press("Save");
  await g.expect("Patch > Create Patch from Commit... saves that commit", () =>
    readdirSync(patches).some(
      (name) => name !== "play-all.patch" && readFileSync(join(patches, name), "utf8").includes("step 2"),
    ),
  );

  const clip =
    "diff --git a/clip.txt b/clip.txt\nnew file mode 100644\n--- /dev/null\n+++ b/clip.txt\n" +
    "@@ -0,0 +1 @@\n+from the clipboard\n";
  if (g.clipboard) {
    await page.evaluate(async (text) => navigator.clipboard.writeText(text), clip);
    await g.menu("Patch", "Apply Patch from Clipboard");
    await g.expect(
      "Patch > Apply Patch from Clipboard applies the browser's clipboard",
      () => g.read("clip.txt") === "from the clipboard\n",
    );
  } else {
    console.log(`SKIP ${g.name}: Apply Patch from Clipboard (this browser cannot give the page the clipboard)`);
  }
}
