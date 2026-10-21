// The Git menu UI tests' harness: a Workspace (workspace.ts) plus a Playwright page that clicks the page's own menu
// bar and dialogs (in-page events only, never the operating system's). See docs/wiki/developer/Git-Menu-UI-Tests.md.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "playwright";
import { type Options, Workspace } from "./workspace";

export type { Options } from "./workspace";

/** A label, then an optional shortcut such as "Cmd+K" or "Option+Shift+Cmd+S". */
function label(name: string): RegExp {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+\\S*\\+\\S*)?$`);
}

/** One group of scenarios: its own workspace, server and page. */
export class Group extends Workspace {
  readonly failures: string[] = [];
  page!: Page;
  /** The page may read the clipboard (Chromium with the permission; WebKit cannot be given it). */
  clipboard = false;
  private context: BrowserContext | null = null;
  private steps = 0;

  constructor(readonly name: string) {
    super();
  }

  async open(browser: Browser, options: Options, permissions: string[] = []): Promise<void> {
    const url = await this.startServer(options);
    this.context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    this.clipboard = permissions.includes("clipboard-read");
    if (permissions.length > 0) {
      await this.context.grantPermissions(permissions, { origin: new URL(url).origin });
    }
    this.page = await this.context.newPage();
    this.page.on("pageerror", (error) => this.check(`no page error (${error.message})`, false));
    await this.page.goto(url);
    await this.page.getByRole("menubar").waitFor();
    await this.page.waitForTimeout(1000);
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.dispose();
  }

  // --- the page ---

  /** Clicks Git, then each submenu, then the item; a string matches the label, a RegExp the whole name. */
  async menu(...path: (string | RegExp)[]): Promise<void> {
    // A git command still finishing refuses the click with "Wait for ... to finish"; then click again once it is done.
    for (let attempt = 0; attempt < 10; attempt++) {
      const waits = (await this.toasts()).split("Wait for").length;
      await this.clickMenu(path);
      if ((await this.toasts()).split("Wait for").length === waits) {
        return;
      }
      await this.page.waitForTimeout(800);
    }
  }

  private async clickMenu(path: (string | RegExp)[]): Promise<void> {
    // A dialog left open (the Conflicts dialog opens by itself) would cover the menu bar.
    await this.closeDialogs();
    await this.closeMenus();
    await this.page.getByRole("menubar").getByRole("menuitem", { name: "Git", exact: true }).click();
    for (const [index, name] of path.entries()) {
      const item = this.page
        .getByRole("menu")
        .last()
        .getByRole("menuitem", { name: typeof name === "string" ? label(name) : name });
      if (index < path.length - 1) {
        await item.hover();
        await this.page.waitForTimeout(250);
      } else {
        await item.click();
      }
    }
    await this.page.waitForTimeout(400);
    await this.trace(`menu ${path.map(String).join(" ")}`);
  }

  /** With UI_TEST_TRACE=<folder>, a screenshot after every menu item and dialog button, for finding a flaky step. */
  private async trace(step: string): Promise<void> {
    const folder = process.env.UI_TEST_TRACE;
    if (folder) {
      mkdirSync(folder, { recursive: true });
      const name = `${this.name}-${String(++this.steps).padStart(3, "0")}-${step.replace(/[^a-z0-9]+/gi, "-")}.png`;
      await this.page.screenshot({ path: join(folder, name) });
    }
  }

  /** The labels of the Git menu (or a submenu of it) as shown now. */
  async menuLabels(...path: string[]): Promise<string[]> {
    await this.closeDialogs();
    await this.closeMenus();
    await this.page.getByRole("menubar").getByRole("menuitem", { name: "Git", exact: true }).click();
    for (const name of path) {
      await this.page
        .getByRole("menu")
        .last()
        .getByRole("menuitem", { name: label(name) })
        .hover();
      await this.page.waitForTimeout(250);
    }
    const texts = await this.page.getByRole("menu").last().getByRole("menuitem").allInnerTexts();
    await this.closeMenus();
    return texts.map((text) => text.split("\n")[0].trim());
  }

  async closeMenus(): Promise<void> {
    for (let i = 0; i < 3 && (await this.page.getByRole("menu").count()) > 0; i++) {
      await this.page.keyboard.press("Escape");
    }
  }

  /** Escape until no dialog is open (a stopped merge opens the Conflicts dialog by itself, for one). */
  async closeDialogs(): Promise<void> {
    for (let i = 0; i < 4 && (await this.dialogOpen()); i++) {
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(200);
      // Escape only reaches a dialog that holds the focus; its close button always works.
      const close = this.dialog().getByRole("button", { name: "Close", exact: true });
      if ((await this.dialogOpen()) && (await close.count()) > 0) {
        await close.first().click();
        await this.page.waitForTimeout(200);
      }
    }
  }

  dialog(): Locator {
    return this.page.getByRole("dialog").last();
  }

  async dialogOpen(): Promise<boolean> {
    return (await this.page.getByRole("dialog").count()) > 0;
  }

  /** Clicks a dialog button by its exact name, the last one when several match. */
  async press(button: string | RegExp): Promise<void> {
    const name = typeof button === "string" ? new RegExp(`^${button}$`) : button;
    await this.dialog().getByRole("button", { name }).last().click();
    await this.trace(`press ${String(button)}`);
  }

  async toasts(): Promise<string> {
    const texts = await this.page.locator("[role='alert'], [role='status']").allInnerTexts();
    return texts.join(" / ").replace(/\s+/g, " ");
  }

  /** What the notification center holds (toasts that already went away end up there). */
  async notifications(): Promise<string> {
    const messages = this.page.getByRole("group", { name: "Messages" });
    if (!(await messages.isVisible().catch(() => false))) {
      await this.page
        .getByRole("button", { name: "Notifications", exact: true })
        .last()
        .click()
        .catch(() => undefined);
      await this.page.waitForTimeout(400);
    }
    const text = await messages.innerText({ timeout: 2000 }).catch(() => "");
    return text.replace(/\s+/g, " ").slice(0, 400);
  }

  /** Lets the page notice files changed outside it. */
  async refresh(): Promise<void> {
    await this.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await this.page.waitForTimeout(1200);
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await this.page.getByRole("menubar").waitFor();
    await this.page.waitForTimeout(1000);
  }

  changes(): Locator {
    return this.page.locator("aside.panel.left");
  }

  /** Opens a file from the Files panel. */
  async openFile(name: string): Promise<void> {
    const entry = this.page.locator("aside.panel.right").getByText(name, { exact: true }).first();
    if (await entry.isVisible()) {
      await entry.click();
    } else {
      // The Files panel may be hidden (a View command did it): Go to File reaches the file anyway.
      await this.page.keyboard.press("ControlOrMeta+P");
      await this.page.keyboard.type(name);
      await this.page.waitForTimeout(400);
      await this.page.keyboard.press("Enter");
    }
    await this.page.waitForTimeout(1000);
  }

  /** Puts the caret at the start of a visible editor line (its inline notes can cover a plain click). */
  async clickLine(text: string): Promise<void> {
    const line = this.page.locator(".cm-line:visible", { hasText: text }).last();
    const box = await line.boundingBox();
    if (!box) {
      throw new Error(`no visible line with "${text}"`);
    }
    await this.page.mouse.click(box.x + 5, box.y + box.height / 2);
  }

  // --- checks ---

  check(name: string, ok: boolean, detail = ""): void {
    console.log(`${ok ? "PASS" : "FAIL"} ${this.name}: ${name}${!ok && detail ? `  [${detail}]` : ""}`);
    if (!ok) {
      this.failures.push(`${this.name}: ${name}${detail ? ` [${detail}]` : ""}`);
    }
  }

  /** Waits for a condition without recording it; true when it came true in time. */
  async until(condition: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (!(await condition())) {
      if (Date.now() > end) {
        return false;
      }
      await this.page.waitForTimeout(200);
    }
    return true;
  }

  /** Waits until the Changes panel lists a file the test changed on disk. */
  async waitForChange(fileName: string): Promise<void> {
    await this.refresh();
    await this.until(() => this.changes().getByText(fileName, { exact: true }).first().isVisible());
  }

  /** A stopped merge or rebase opens the Conflicts dialog by itself, a moment later: wait for it, then close it. */
  async dismissConflictsDialog(): Promise<void> {
    await this.until(() => this.dialogOpen(), 4000);
    await this.closeDialogs();
  }

  /** Waits up to 15 seconds for a condition, then records it. */
  async expect(
    name: string,
    condition: () => boolean | Promise<boolean>,
    detail: () => string = () => "",
  ): Promise<void> {
    const until = Date.now() + 15_000;
    let ok = false;
    while (!(ok = await condition()) && Date.now() < until) {
      await this.page.waitForTimeout(250);
    }
    // A failure also lists what the page said (an error toast tells why an action did nothing), and leaves a
    // screenshot in ui-test-failures/ (CI keeps the folder).
    if (!ok) {
      const folder = join(process.cwd(), "ui-test-failures");
      mkdirSync(folder, { recursive: true });
      await this.page.screenshot({ path: join(folder, `${this.name}-${this.failures.length + 1}.png`) });
    }
    const said = ok
      ? ""
      : [detail(), await this.toasts(), await this.notifications()].filter(Boolean).join(" | ").replace(/\n/g, " / ");
    this.check(name, ok, ok ? "" : said);
  }
}
