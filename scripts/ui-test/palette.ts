// Every command of the Command Palette (Shift+Cmd+P), run from the palette in turn: each must run without a page
// error or an error toast. Commands that open a dialog, menu or tab are closed again; the rest of their effect is
// covered by the other groups. Close Folder runs last, since it ends the workspace.

import type { Page } from "playwright";
import type { Group } from "./harness";

/** Run last: it closes the workspace the other commands need. */
const LAST = ["File: Close Folder"];
/** Never run: closing the window closes the browser tab the test drives. */
const SKIP = ["Window: Close Window", "File: Close Window"];
const ERROR_TOAST = /\b(failed|error|could not)\b/i;
/** The run blocks the network, so these may only say they could not reach it (App: on macOS, Help: elsewhere). */
const OFFLINE = ["App: Check for Updates", "Help: Check for Updates"];

/** A row's name ("Git: Pull"), without its shortcut, disabled reason or counts such as "(1 behind)". */
export function commandName(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .replace(/ \(\d+ (ahead|behind)\)/g, "")
    .trim();
}

/** The Quick Open popup's rows (other lists on the page have options too). */
function rows(page: Page) {
  return page.getByLabel("Quick Open", { exact: true }).getByRole("option");
}

/** The name part of every row: its first span; the shortcut and the reason are separate elements. */
async function rowNames(page: Page): Promise<string[]> {
  const labels = await rows(page).evaluateAll((options) =>
    options.map((option) => option.querySelector(":scope > span")?.textContent ?? ""),
  );
  return labels.map(commandName);
}

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Shift+P");
  await rows(page).first().waitFor();
}

async function listCommands(g: Group): Promise<string[]> {
  await openPalette(g.page);
  const names = await rowNames(g.page);
  await g.page.keyboard.press("Escape");
  return [...new Set(names)];
}

/** Puts the page back to plain: no dialog, menu, popover or extra tab, and the menu bar showing. */
async function settle(g: Group): Promise<void> {
  for (const extra of g.page
    .context()
    .pages()
    .filter((page) => page !== g.page)) {
    await extra.close();
  }
  await g.closeDialogs();
  await g.closeMenus();
  await g.page.keyboard.press("Escape");
  if (!(await g.page.getByRole("menubar").isVisible())) {
    await g.page.getByRole("menubar").waitFor({ timeout: 15_000 });
  }
}

/** Runs one command from the palette; returns "ran", "disabled" or "missing". */
async function runCommand(g: Group, name: string): Promise<"ran" | "disabled" | "missing"> {
  await openPalette(g.page);
  await g.page.keyboard.type(name.split(": ").slice(1).join(": ") || name);
  await g.page.waitForTimeout(250);
  const options = rows(g.page);
  for (const [index, shownName] of (await rowNames(g.page)).entries()) {
    if (shownName !== name) {
      continue;
    }
    const option = options.nth(index);
    if ((await option.getAttribute("aria-disabled")) === "true") {
      await g.page.keyboard.press("Escape");
      return "disabled";
    }
    await option.click();
    return "ran";
  }
  await g.page.keyboard.press("Escape");
  return "missing";
}

export async function palette(g: Group): Promise<void> {
  const page = g.page;
  // Help links and the like open web pages: keep the run off the network.
  const local = new URL(page.url()).origin;
  await page
    .context()
    .route(/.*/, (route) =>
      route.request().url().startsWith(local) || route.request().url().startsWith("data:")
        ? route.continue()
        : route.abort(),
    );
  g.write("notes.txt", "a change for the commands\n");
  await g.waitForChange("notes.txt");
  await g.openFile("notes.txt");

  // Esc closes the Navigation Bar's list even when the focus fell to the page, as when the window comes back to the
  // front; it once stayed open and kept every shortcut from working.
  await runCommand(g, "Edit: Jump to Navigation Bar");
  const crumbList = page.getByRole("dialog", { name: /^Navigation bar: / });
  await crumbList.waitFor();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await g.expect("Esc closes the Navigation Bar's list with the focus on the page", async () => {
    return (await crumbList.count()) === 0;
  });
  await settle(g);

  const names = await listCommands(g);
  g.check(`the palette lists the app's commands (${names.length})`, names.length > 100, String(names.length));
  // Commands that close tabs run near the end, so the file the others act on stays open.
  const closing = (name: string) => /Close/.test(name) && !LAST.includes(name);
  const order = [
    ...names.filter((name) => !closing(name) && !LAST.includes(name)),
    ...names.filter(closing),
    ...LAST.filter((name) => names.includes(name)),
  ];
  const disabled: string[] = [];
  for (const name of order) {
    if (SKIP.includes(name)) {
      console.log(`SKIP ${g.name}: ${name} (would close the tab the test runs in)`);
      continue;
    }
    // Editor and file commands need a file open; the Markdown views need a Markdown file.
    if (/^View > Markdown/.test(name)) {
      await g.openFile("README.md");
    } else if (/^(Git > Current File|Code|Edit|Git > Uncommitted Changes: .*Lines)/.test(name)) {
      await g.openFile("notes.txt");
    }
    const before = await g.toasts();
    let outcome: string;
    try {
      outcome = await runCommand(g, name);
      await page.waitForTimeout(700);
    } catch (error) {
      g.check(`${name} runs`, false, (error as Error).message.split("\n")[0]);
      await settle(g).catch(() => undefined);
      continue;
    }
    const after = await g.toasts();
    const newToast = after.replace(before, "");
    if (outcome === "disabled") {
      disabled.push(name);
    } else {
      g.check(
        `${name} runs without an error`,
        outcome === "ran" && (!ERROR_TOAST.test(newToast) || OFFLINE.includes(name)),
        `${outcome} ${newToast}`,
      );
    }
    await settle(g).catch(() => undefined);
  }
  console.log(`INFO ${g.name}: disabled in this state (not run): ${disabled.join(", ") || "none"}`);
  await g.expect("after Close Folder the Welcome screen shows", () =>
    page.getByPlaceholder("Search projects").isVisible(),
  );
}
