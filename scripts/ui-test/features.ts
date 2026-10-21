// Features with no Git menu item: the editor, Find in Files, Settings, the theme button, a split editor, the
// terminal, the Files panel (rename, duplicate, move to Trash), a commit from the Changes panel and moving the
// activity bar icons (their menu, dragging, Reset Positions). Each result is
// checked on disk, in the settings file or with plain git.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Group } from "./harness";

/** The layout state (state.json) next to the settings: where the activity bar icons sit. */
function layoutState(g: Group): Record<string, string[]> {
  for (const folder of readdirSync(g.home).filter((name) => name.startsWith(".nibtree"))) {
    const file = join(g.home, folder, "state.json");
    if (existsSync(file)) {
      try {
        return (
          (JSON.parse(readFileSync(file, "utf8")) as { activityLayout?: Record<string, string[]> }).activityLayout ?? {}
        );
      } catch {
        return {};
      }
    }
  }
  return {};
}

/** The app's settings, read from the group's own home folder (`.nibtree` or `.nibtree-browser`). */
function settings(g: Group): Record<string, unknown> {
  for (const folder of readdirSync(g.home).filter((name) => name.startsWith(".nibtree"))) {
    const file = join(g.home, folder, "settings.json");
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }
  return {};
}

export async function features(g: Group): Promise<void> {
  await editor(g);
  await findInFiles(g);
  await settingsAndTheme(g);
  await splitEditor(g);
  await terminal(g);
  await filesPanel(g);
  await commitFromChanges(g);
  await activityPositions(g);
}

async function editor(g: Group): Promise<void> {
  const page = g.page;
  await g.openFile("notes.txt");
  await g.clickLine("line 3");
  await page.keyboard.press("End");
  await page.keyboard.type(" typed in the editor");
  await page.keyboard.press("ControlOrMeta+S");
  await g.expect("Editor: typing, then Cmd+S, saves the file", () =>
    g.read("notes.txt").includes("typed in the editor"),
  );
  // At once, while the first save may still be writing: the second one must follow it, not be dropped.
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+S");
  await g.expect(
    "Editor: Cmd+Z undoes it and Cmd+S saves that",
    () => g.read("notes.txt") === "line 1\nline 2\nline 3\n",
    () => JSON.stringify(g.read("notes.txt")),
  );
}

async function findInFiles(g: Group): Promise<void> {
  const page = g.page;
  g.write("src/greet.ts", "export const greeting = 'hello from the search';\n");
  await g.refresh();
  await page.keyboard.press("ControlOrMeta+Shift+F");
  await page.keyboard.type("hello from the search");
  await g.expect("Find in Files lists the file that has the text", () =>
    page.getByText("greet.ts", { exact: true }).first().isVisible(),
  );
  await g.closeDialogs();
  await page.keyboard.press("Escape");
}

async function settingsAndTheme(g: Group): Promise<void> {
  const page = g.page;
  await page.keyboard.press("ControlOrMeta+Comma");
  await g.expect("Settings opens with Cmd+,", async () => {
    return (await g.dialogOpen()) && /Settings/.test(await g.dialog().innerText());
  });
  await g.closeDialogs();

  await g.openFile("notes.txt");
  const wrap = settings(g).wordWrap === true;
  await page.keyboard.press("Alt+KeyZ");
  await g.expect("Word Wrap (Option+Z) is saved to the settings", () => (settings(g).wordWrap === true) !== wrap);

  const theme = settings(g).theme;
  await page.getByRole("button", { name: "Toggle light/dark theme" }).click();
  await g.expect("The theme button switches the theme and saves it", () => {
    const now = settings(g).theme;
    return (now === "light" || now === "dark") && now !== theme;
  });
}

async function splitEditor(g: Group): Promise<void> {
  const page = g.page;
  await g.openFile("notes.txt");
  const editors = page.locator(".cm-editor:visible");
  const before = await editors.count();
  await page.keyboard.press("ControlOrMeta+Backslash");
  await g.expect("Split Right (Cmd+\\) shows the file in a second group", async () => (await editors.count()) > before);
}

async function terminal(g: Group): Promise<void> {
  const page = g.page;
  await page.keyboard.press("Control+Backquote");
  const screen = page.locator(".xterm").last();
  if (!(await g.until(() => screen.isVisible(), 10_000))) {
    g.check("Terminal opens with Ctrl+`", false);
    return;
  }
  // Wait for the shell's prompt, and a moment for it to take keys: letters typed earlier are lost.
  await g.until(async () => /[%$#>]\s*$/.test((await screen.innerText()).trim()), 15_000);
  await page.waitForTimeout(800);
  await screen.click();
  await page.keyboard.type("echo terminal-ok > term-check.txt", { delay: 20 });
  await page.keyboard.press("Enter");
  await g.expect(
    "Terminal: a typed command runs in the repository",
    () => g.read("term-check.txt") === "terminal-ok\n",
  );
  await page.keyboard.press("Control+Backquote");
}

/** Clicks a file's row in the Files panel, which selects it (and opens it). */
async function selectInFiles(g: Group, fileName: string): Promise<void> {
  const row = g.page.locator("aside.panel.right").getByText(fileName, { exact: true }).first();
  // Another panel (Notifications, after a failed check) may stand in its place: Cmd+B shows Files again.
  if (!(await g.until(() => row.isVisible(), 3000))) {
    await g.page.keyboard.press("ControlOrMeta+B");
  }
  await row.click();
  await g.page.waitForTimeout(500);
}

async function filesPanel(g: Group): Promise<void> {
  const page = g.page;
  g.write("made.txt", "made on disk\n");
  await g.refresh();
  await selectInFiles(g, "made.txt");
  await page.keyboard.press("F2");
  const field = page.getByRole("textbox", { name: "New name" });
  await field.fill("renamed.txt");
  await field.press("Enter");
  await g.expect("Files: F2 renames the selected file", () => g.exists("renamed.txt") && !g.exists("made.txt"));

  await selectInFiles(g, "renamed.txt");
  await page.keyboard.press("ControlOrMeta+D");
  await g.expect("Files: Cmd+D duplicates it", () => g.exists("renamed copy.txt"));

  // macOS's Trash ignores HOME, so a local run would fill your own Trash: there only the question is checked.
  await selectInFiles(g, "renamed copy.txt");
  await page.keyboard.press("Delete");
  await g.expect("Files: Delete asks before moving to the Trash", async () => {
    return (await g.dialogOpen()) && /Move to Trash/.test(await g.dialog().innerText());
  });
  if (process.platform === "darwin") {
    console.log(`SKIP ${g.name}: Move to Trash itself (it would use your own Trash on macOS)`);
    await g.closeDialogs();
    return;
  }
  await g.press("Move to Trash");
  await g.expect("Files: Move to Trash removes the file", () => !g.exists("renamed copy.txt"));
}

async function commitFromChanges(g: Group): Promise<void> {
  const page = g.page;
  g.write("from-panel.txt", "committed from the Changes panel\n");
  await g.waitForChange("from-panel.txt");
  await g.stageRow("from-panel.txt");
  await g.until(() => g.git(["diff", "--cached", "--name-only"]) === "from-panel.txt");
  const message = g
    .changes()
    .getByRole("textbox", { name: /Commit message|Message/ })
    .first();
  await message.click();
  await page.keyboard.type("commit from the Changes panel");
  await page.keyboard.press("ControlOrMeta+Enter");
  await g.expect(
    "Changes panel: Cmd+Enter in the message commits the staged file",
    () => g.git(["log", "-1", "--format=%s"]) === "commit from the Changes panel",
    () => g.git(["status", "--porcelain"]),
  );
}

async function activityPositions(g: Group): Promise<void> {
  const page = g.page;
  const left = page.getByRole("navigation", { name: "Sidebar", exact: true });
  const right = page.getByRole("navigation", { name: "Right sidebar", exact: true });
  const icon = (bar: typeof left, name: string) => bar.getByRole("button", { name, exact: true });
  const moveTo = async (bar: typeof left, name: string, item: string) => {
    await icon(bar, name).click({ button: "right" });
    await page.getByRole("menuitem", { name: item }).click();
  };
  if (
    !(await icon(left, "Changes")
      .getAttribute("aria-pressed")
      .then((on) => on === "true"))
  ) {
    await icon(left, "Changes").click();
  }

  await moveTo(left, "Changes", "Move to Right Top");
  await g.expect("Activity bar: Move to Right Top puts the Changes icon in the right bar", async () => {
    return (await icon(right, "Changes").isVisible()) && (await icon(left, "Changes").count()) === 0;
  });
  await g.expect("...and its panel moves to the right side with it", () =>
    page
      .locator("aside.panel.right")
      .getByRole("textbox", { name: /message/i })
      .first()
      .isVisible(),
  );
  await g.expect("...and the place is saved", () => (layoutState(g)["right-top"] ?? []).includes("changes"));

  // Drag the Files icon from the right bar into the left bar's bottom group.
  const from = await icon(right, "Files").boundingBox();
  const to = await icon(left, "Terminal").boundingBox();
  if (from && to) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x - 40, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height + 4, { steps: 10 });
    await page.mouse.up();
  }
  await g.expect(
    "Activity bar: dragging the Files icon moves it to the left bar's bottom",
    () => (layoutState(g)["left-bottom"] ?? []).at(-1) === "files",
  );
  if ((await icon(left, "Files").getAttribute("aria-pressed")) !== "true") {
    await icon(left, "Files").click();
  }
  await g.expect("...and the Files panel opens on the left", () =>
    page.locator("aside.panel.left").getByText("notes.txt", { exact: true }).first().isVisible(),
  );

  await moveTo(right, "Changes", "Reset Positions");
  await g.expect("Activity bar: Reset Positions puts every icon back", async () => {
    return (await icon(left, "Changes").isVisible()) && (await icon(right, "Files").isVisible());
  });
}
