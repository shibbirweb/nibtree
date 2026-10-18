// The native parity check (`bun run ui:swift:parity`): every scenario in ui/swift/parity is drawn by ui/web in WebKit
// and by ui/swift with SwiftUI, in light and dark. A component passes when its pictures match at least 99% and its
// Swift render is faster than the web one; any failure fails the run (and CI). Pictures, diffs and the report go to
// ui/swift/.parity/ (not committed). `--match` or `--speed` runs one of the two checks, which CI runs side by side.
//   bun run ui:swift:parity [--match | --speed] [scenario ids...]
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";
import { createServer } from "vite";
import { sideBySidePng } from "./parity/browser";
import { compare, best, verdict, type Match, type Verdict } from "./parity/compare";
import { decodePng } from "./parity/png";
import { componentDocs } from "../../web/src/lib/docs";
import { propProblems, stateProblems, swiftProps } from "./parity/props";
import { scenarioProblems, type Scenario } from "./parity/scenario";
import { harnessSource, swiftBinary } from "./parity/swiftBinary";
import { swiftComponents } from "./coverage";

const swiftRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(swiftRoot, "../web");
const scenarioDir = join(swiftRoot, "parity");
const outDir = join(swiftRoot, ".parity");
const BENCH_COUNT = Number(process.env.NIBTREE_PARITY_COUNT ?? 200);
const BENCH_WARMUP = 2;
const BENCH_RUNS = 7;
/** Times a scenario whose Swift side lost is timed again, both sides, before it fails. */
const BENCH_RECHECKS = 2;
const THEMES = ["light", "dark"] as const;
const flags = process.argv.slice(2);
const checkMatch = !flags.includes("--speed");
const checkSpeed = !flags.includes("--match");

function loadScenarios(): Scenario[] {
  const known = new Set(swiftComponents());
  const seen = new Set<string>();
  const problems: string[] = [];
  const all: Scenario[] = [];
  for (const file of readdirSync(scenarioDir).filter((name) => name.endsWith(".json"))) {
    const content: unknown = JSON.parse(readFileSync(join(scenarioDir, file), "utf8"));
    problems.push(...scenarioProblems(file, content, known, seen));
    all.push(...(content as Scenario[]));
  }
  const harness = harnessSource(swiftRoot);
  for (const component of known) {
    const source = readFileSync(join(swiftRoot, `Sources/NibtreeUI/Components/N${component}.swift`), "utf8");
    problems.push(...propProblems(component, swiftProps(source, component), all, harness));
    const states = componentDocs.find((doc) => doc.name === component)?.states ?? [];
    problems.push(...stateProblems(component, states, all));
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  return only.length ? all.filter((scenario) => only.includes(scenario.id)) : all;
}

const scenarios = loadScenarios();
mkdirSync(join(outDir, "web"), { recursive: true });
mkdirSync(join(outDir, "diff"), { recursive: true });
const binary = swiftBinary(swiftRoot);
if (checkMatch) {
  execFileSync(binary, ["--parity", scenarioDir, join(outDir, "swift")], { stdio: "inherit" });
}

/** One process per scenario, like the web side's fresh page: a big scenario leaves a process slower for the rest. */
function swiftBench(id: string): number {
  const args = ["--bench", scenarioDir, String(BENCH_COUNT), String(BENCH_WARMUP), String(BENCH_RUNS), id];
  const line = execFileSync(binary, args).toString().trim().split("\n")[0] ?? "{}";
  return (JSON.parse(line) as { ms?: number }).ms ?? Number.NaN;
}

const server = await createServer({
  configFile: join(webRoot, "vite.config.ts"),
  server: { port: 1432 },
  logLevel: "error",
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? "http://localhost:1432/";
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
const verdicts: Verdict[] = [];

/** Warmed up, then the best of BENCH_RUNS in the same page: the component's own cost, not the machine's noise. */
async function webBench(id: string): Promise<number> {
  await page.goto(`${base}native.html?scenario=${id}&theme=light`);
  await page.waitForSelector("#frame[data-ready]");
  const webTimes: number[] = [];
  for (let run = 0; run < BENCH_WARMUP + BENCH_RUNS; run += 1) {
    const ms = await page.evaluate(
      (count) => (window as unknown as { nativeBench(n: number): Promise<number> }).nativeBench(count),
      BENCH_COUNT,
    );
    if (run >= BENCH_WARMUP) {
      webTimes.push(ms);
    }
  }
  return best(webTimes);
}

for (const scenario of scenarios) {
  const matches: Match[] = [];
  for (const theme of checkMatch ? THEMES : []) {
    await page.goto(`${base}native.html?scenario=${scenario.id}&theme=${theme}`);
    await page.waitForSelector("#frame[data-ready]");
    const webFile = join(outDir, "web", `${scenario.id}-${theme}.png`);
    // Animations at rest, like the Swift side's `nibtreeStill`: endless ones at their start, others at their end.
    await page.locator("#frame").screenshot({ path: webFile, animations: "disabled" });
    const swiftFile = join(outDir, "swift", `${scenario.id}-${theme}.png`);
    const [webBytes, swiftBytes] = [readFileSync(webFile), readFileSync(swiftFile)];
    matches.push(compare(decodePng(webBytes), decodePng(swiftBytes)));
    const diff = await sideBySidePng(page, webBytes.toString("base64"), swiftBytes.toString("base64"));
    writeFileSync(join(outDir, "diff", `${scenario.id}-${theme}.png`), Buffer.from(diff, "base64"));
  }
  if (!checkSpeed) {
    verdicts.push(verdict(scenario.id, matches));
    continue;
  }
  // Both sides back to back, so a shared machine's speed (a CI runner's drifts by a third) is the same for both;
  // a loser is timed again, both sides, so one slow moment does not fail it.
  let [webMs, swiftMs] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  for (let attempt = 0; attempt <= BENCH_RECHECKS && !(swiftMs < webMs); attempt += 1) {
    swiftMs = Math.min(swiftMs, swiftBench(scenario.id));
    webMs = Math.min(webMs, await webBench(scenario.id));
  }
  verdicts.push(verdict(scenario.id, matches, webMs, swiftMs));
}
await browser.close();
await server.close();

writeFileSync(join(outDir, "report.json"), JSON.stringify(verdicts, null, 2));
for (const one of verdicts) {
  const mark = one.problems.length ? "FAIL" : "ok  ";
  const speed = checkSpeed ? `  ${one.swiftMs.toFixed(1)} ms vs web ${one.webMs.toFixed(1)} ms` : "";
  const strict = `(same spot ${(one.strict * 100).toFixed(2)}%)`;
  const match = checkMatch ? ` ${(one.match * 100).toFixed(2).padStart(6)}% ${strict}` : "";
  console.log(`${mark} ${one.id.padEnd(28)}${match}${speed}`);
  for (const problem of one.problems) {
    console.log(`       ${problem}`);
  }
}
const failed = verdicts.filter((one) => one.problems.length > 0);
if (process.env.GITHUB_ACTIONS && failed.length > 0) {
  // An annotation, unlike the log, can be read without signing in to GitHub (the check run's annotations API).
  const lines = failed.map((one) => `${one.id}: ${one.problems.join("; ")}`);
  console.log(`::error title=${failed.length} of ${verdicts.length} scenarios fail::${lines.join("%0A")}`);
}
if (process.env.GITHUB_ACTIONS && checkSpeed) {
  const times = verdicts.map((one) => `${one.id} ${one.swiftMs.toFixed(1)} / ${one.webMs.toFixed(1)}`);
  console.log(`::notice title=Swift / web ms::${times.join("%0A")}`);
}
console.log(
  `\n${verdicts.length - failed.length} of ${verdicts.length} scenarios pass (pictures in ui/swift/.parity).`,
);
process.exit(failed.length > 0 ? 1 : 0);
