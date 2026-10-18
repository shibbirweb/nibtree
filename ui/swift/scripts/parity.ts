// The native parity check (`bun run ui:swift:parity`): every scenario in ui/swift/parity is drawn by ui/web in WebKit
// and by ui/swift with SwiftUI, in light and dark. A component passes when its pictures match at least 99% and its
// Swift render is faster than the web one; any failure fails the run (and CI). Pictures, diffs and the report go to
// ui/swift/.parity/ (not committed).
//   bun run ui:swift:parity [scenario ids...]
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
import { swiftBinary } from "./parity/swiftBinary";
import { swiftComponents } from "./coverage";

const swiftRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(swiftRoot, "../web");
const scenarioDir = join(swiftRoot, "parity");
const outDir = join(swiftRoot, ".parity");
const BENCH_COUNT = Number(process.env.NIBTREE_PARITY_COUNT ?? 200);
const BENCH_WARMUP = 2;
const BENCH_RUNS = 7;
const THEMES = ["light", "dark"] as const;

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
  const harness = readFileSync(join(swiftRoot, "Sources/NibtreeShowcase/Parity/ScenarioView.swift"), "utf8");
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
execFileSync(binary, ["--parity", scenarioDir, join(outDir, "swift")], { stdio: "inherit" });
const swiftTimes = new Map<string, number>();
for (const line of execFileSync(binary, [
  "--bench",
  scenarioDir,
  String(BENCH_COUNT),
  String(BENCH_WARMUP),
  String(BENCH_RUNS),
])
  .toString()
  .split("\n")
  .filter(Boolean)) {
  const result = JSON.parse(line) as { id: string; ms: number };
  swiftTimes.set(result.id, result.ms);
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
for (const scenario of scenarios) {
  const matches: Match[] = [];
  for (const theme of THEMES) {
    await page.goto(`${base}native.html?scenario=${scenario.id}&theme=${theme}`);
    await page.waitForSelector("#frame[data-ready]");
    const webFile = join(outDir, "web", `${scenario.id}-${theme}.png`);
    await page.locator("#frame").screenshot({ path: webFile });
    const swiftFile = join(outDir, "swift", `${scenario.id}-${theme}.png`);
    const [webBytes, swiftBytes] = [readFileSync(webFile), readFileSync(swiftFile)];
    matches.push(compare(decodePng(webBytes), decodePng(swiftBytes)));
    const diff = await sideBySidePng(page, webBytes.toString("base64"), swiftBytes.toString("base64"));
    writeFileSync(join(outDir, "diff", `${scenario.id}-${theme}.png`), Buffer.from(diff, "base64"));
  }
  // Warmed up, then the best of BENCH_RUNS in the same page: the component's own cost, not the machine's noise.
  await page.goto(`${base}native.html?scenario=${scenario.id}&theme=light`);
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
  verdicts.push(verdict(scenario.id, matches, best(webTimes), swiftTimes.get(scenario.id) ?? Number.NaN));
}
await browser.close();
await server.close();

writeFileSync(join(outDir, "report.json"), JSON.stringify(verdicts, null, 2));
for (const one of verdicts) {
  const mark = one.problems.length ? "FAIL" : "ok  ";
  const speed = `${one.swiftMs.toFixed(1)} ms vs web ${one.webMs.toFixed(1)} ms`;
  const strict = `(same spot ${(one.strict * 100).toFixed(2)}%)`;
  console.log(`${mark} ${one.id.padEnd(28)} ${(one.match * 100).toFixed(2).padStart(6)}% ${strict}  ${speed}`);
  for (const problem of one.problems) {
    console.log(`       ${problem}`);
  }
}
const failed = verdicts.filter((one) => one.problems.length > 0);
console.log(
  `\n${verdicts.length - failed.length} of ${verdicts.length} scenarios pass (pictures in ui/swift/.parity).`,
);
process.exit(failed.length > 0 ? 1 : 0);
