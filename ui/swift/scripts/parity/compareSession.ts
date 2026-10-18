// The compare tool's work (scripts/compare.ts): one scenario, perhaps not saved yet, drawn by ui/web in WebKit and
// by the Swift showcase, compared the way the parity gate does, timed on request, and saved as a new scenario.
// Requests run one at a time: they share one WebKit page and the scratch folder.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { webkit, type Browser, type Page } from "playwright";
import { format, resolveConfig } from "prettier";
import { swiftComponents } from "../coverage";
import { sideBySidePng } from "./browser";
import { best, compare } from "./compare";
import { decodePng } from "./png";
import { scenarioProblems, type Scenario } from "./scenario";
import { swiftBinary } from "./swiftBinary";

const run = promisify(execFile);
const THEMES = ["light", "dark"] as const;
const BENCH_WARMUP = 2;
const BENCH_RUNS = 5;

export interface ThemeResult {
  theme: (typeof THEMES)[number];
  /** web | Swift | diff, base64 PNG. */
  sideBySide: string;
  match: number;
  strict: number;
  sameSize: boolean;
  /** Why this theme could not be drawn (the web frame has no size, say); the numbers are 0 then. */
  error?: string;
}

export interface Timing {
  count: number;
  webMs: number;
  swiftMs: number;
}

export class CompareSession {
  private binary = "";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly work: string;
  /** The native window (the showcase with --live), its file, and the count that brings it to the front. */
  private live: ChildProcess | null = null;
  private liveScenario: Scenario | null = null;
  private focus = 0;
  /** The user closed the window: edits no longer open it, only the page's Native window button does. */
  private liveClosed = false;

  constructor(
    private readonly swiftRoot: string,
    private readonly base: string,
  ) {
    this.work = join(swiftRoot, ".parity", "compare");
  }

  async start(): Promise<void> {
    this.binary = swiftBinary(this.swiftRoot);
    this.browser = await webkit.launch();
    this.page = await this.browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
  }

  async stop(): Promise<void> {
    this.live?.kill();
    await this.browser?.close();
  }

  private get liveFile(): string {
    return join(this.work, "live", "scenario.json");
  }

  /** Shows the scenario in the native window; `front` brings it forward, opening it again if the user closed it. */
  showLive(scenario: Scenario | null, front = false): void {
    this.liveScenario = scenario ?? this.liveScenario;
    if (!this.liveScenario) {
      return;
    }
    if (front) {
      this.focus += 1;
      this.liveClosed = false;
    }
    mkdirSync(join(this.work, "live"), { recursive: true });
    // Written beside it and renamed in, so the window never reads half a file.
    writeFileSync(`${this.liveFile}.next`, JSON.stringify({ scenario: this.liveScenario, focus: this.focus }));
    renameSync(`${this.liveFile}.next`, this.liveFile);
    if (!this.live && !this.liveClosed) {
      const window = spawn(this.binary, ["--live", this.liveFile], { stdio: "ignore" });
      window.on("exit", () => {
        // Still the current window, so it was not replaced or stopped here: the user closed it.
        if (this.live === window) {
          this.live = null;
          this.liveClosed = true;
        }
      });
      this.live = window;
    }
  }

  /** Runs one request after the ones before it. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private get webPage(): Page {
    if (!this.page) {
      throw new Error("The compare session has not started");
    }
    return this.page;
  }

  /** The scenarios alone in the scratch folder, as the Swift showcase reads scenarios. */
  private writeScenario(...scenarios: Scenario[]): string {
    const folder = join(this.work, "in");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "scenario.json"), JSON.stringify(scenarios));
    return folder;
  }

  private async openWeb(scenario: Scenario, theme: string): Promise<void> {
    const data = encodeURIComponent(JSON.stringify(scenario));
    await this.webPage.goto(`${this.base}native.html?data=${data}&theme=${theme}`);
    await this.webPage.waitForSelector("#frame[data-ready]", { state: "attached", timeout: 10_000 });
    const box = await this.webPage.locator("#frame").boundingBox();
    if (!box || box.width < 1 || box.height < 1) {
      throw new Error("The web side draws nothing here: its frame has no size");
    }
  }

  async compare(scenario: Scenario): Promise<ThemeResult[]> {
    return (await this.compareMany([scenario]))[0];
  }

  /** Several scenarios (the compare page's grid of values): one Swift run draws them all. */
  compareMany(scenarios: Scenario[]): Promise<ThemeResult[][]> {
    return this.serial(async () => {
      const folder = this.writeScenario(...scenarios);
      const out = join(this.work, "out");
      await run(this.binary, ["--parity", folder, out]);
      const all: ThemeResult[][] = [];
      for (const scenario of scenarios) {
        const results: ThemeResult[] = [];
        for (const theme of THEMES) {
          try {
            await this.openWeb(scenario, theme);
            const web = await this.webPage.locator("#frame").screenshot();
            const swift = readFileSync(join(out, `${scenario.id}-${theme}.png`));
            const match = compare(decodePng(web), decodePng(swift));
            const sideBySide = await sideBySidePng(this.webPage, web.toString("base64"), swift.toString("base64"));
            results.push({ theme, sideBySide, match: match.ratio, strict: match.strict, sameSize: match.sameSize });
          } catch (failure) {
            // One cell that cannot be drawn should not cost the rest of a grid.
            const error = failure instanceof Error ? failure.message.split("\n")[0] : String(failure);
            results.push({ theme, sideBySide: "", match: 0, strict: 0, sameSize: false, error });
          }
        }
        all.push(results);
      }
      return all;
    });
  }

  /** The best of a few runs of `count` copies on each side, after warming up, like the gate. */
  measure(scenario: Scenario, count: number): Promise<Timing> {
    return this.serial(async () => {
      const folder = this.writeScenario(scenario);
      const args = ["--bench", folder, String(count), String(BENCH_WARMUP), String(BENCH_RUNS)];
      const { stdout } = await run(this.binary, args);
      const swiftMs = (JSON.parse(stdout.trim().split("\n")[0] ?? "{}") as { ms?: number }).ms ?? Number.NaN;
      await this.openWeb(scenario, "light");
      const times: number[] = [];
      for (let index = 0; index < BENCH_WARMUP + BENCH_RUNS; index += 1) {
        const ms = await this.webPage.evaluate(
          (copies) => (window as unknown as { nativeBench(n: number): Promise<number> }).nativeBench(copies),
          count,
        );
        if (index >= BENCH_WARMUP) {
          times.push(ms);
        }
      }
      return { count, webMs: best(times), swiftMs };
    });
  }

  /** Builds the Swift showcase again, after its sources changed. */
  rebuild(): Promise<void> {
    return this.serial(async () => {
      this.binary = swiftBinary(this.swiftRoot, true);
      // The open window runs the old build: start the new one in its place.
      if (this.live) {
        const old = this.live;
        this.live = null;
        old.kill();
        this.showLive(null);
      }
    });
  }

  /** Adds the scenario to ui/swift/parity/<component>.json, so the parity gate checks it from now on. */
  save(component: string, scenario: Scenario): Promise<string> {
    return this.serial(async () => {
      const folder = join(this.swiftRoot, "parity");
      const seen = new Set<string>();
      for (const name of readdirSync(folder).filter((file) => file.endsWith(".json"))) {
        for (const one of JSON.parse(readFileSync(join(folder, name), "utf8")) as Scenario[]) {
          seen.add(one.id);
        }
      }
      const problems = scenarioProblems("scenario", [scenario], new Set(swiftComponents()), seen);
      if (problems.length > 0 || !/^[A-Z]\w*$/.test(component)) {
        throw new Error(problems.join("; ") || `Not a component name: ${component}`);
      }
      const file = join(folder, `${component}.json`);
      const list = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Scenario[]) : [];
      const options = (await resolveConfig(file)) ?? {};
      writeFileSync(file, await format(JSON.stringify([...list, scenario]), { ...options, filepath: file }));
      return `ui/swift/parity/${component}.json`;
    });
  }
}
