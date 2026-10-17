// The Swift UI library's coverage of ui/web, as a burn-down to zero like `bun run ui:migration`: every web component
// and whether its Swift twin (`N<Name>.swift` in Sources/NibtreeUI/Components) exists, has a showcase story and has
// parity scenarios (parity/<Name>.json, checked by `bun run ui:swift:parity`).
//   bun run ui:swift:coverage           the components still to build, by group, and the totals
//   bun run ui:swift:coverage --check   only fail on a Swift component without a web twin, a story or scenarios
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = fileURLToPath(new URL("../..", import.meta.url));
const WEB_COMPONENTS = join(uiRoot, "web/src/lib/components");
const SWIFT_COMPONENTS = join(uiRoot, "swift/Sources/NibtreeUI/Components");
const STORIES = join(uiRoot, "swift/Sources/NibtreeShowcase/Stories.swift");
const SCENARIOS = join(uiRoot, "swift/parity");

export interface Coverage {
  /** Web components with a Swift twin. */
  done: string[];
  /** Web components still to build in Swift. */
  missing: string[];
  /** Swift components named after no web component. */
  orphans: string[];
  /** Swift components without a showcase story. */
  unstoried: string[];
  /** Swift components without parity scenarios (parity/<Name>.json). */
  untested: string[];
}

export function webComponents(dir = WEB_COMPONENTS): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".svelte"))
    .map((name) => name.replace(/\.svelte$/, ""))
    .sort();
}

/** `NText.swift` -> `Text`. */
export function swiftComponents(dir = SWIFT_COMPONENTS): string[] {
  return readdirSync(dir)
    .filter((name) => /^N[A-Z]\w*\.swift$/.test(name))
    .map((name) => name.replace(/^N/, "").replace(/\.swift$/, ""))
    .sort();
}

/** Story names in Stories.swift: `Story("Stack", group: ...)`. */
export function storyNames(source = readFileSync(STORIES, "utf8")): string[] {
  return [...source.matchAll(/Story\("([A-Za-z0-9]+)"/g)].map((match) => match[1]);
}

/** Components with a parity scenario file: `Text.json` -> `Text`. */
export function scenarioFiles(dir = SCENARIOS): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/(\.\w+)?\.json$/, ""));
}

export function coverage(web: string[], swift: string[], stories: string[], scenarios: string[] = swift): Coverage {
  const webSet = new Set(web);
  const swiftSet = new Set(swift);
  const storySet = new Set(stories);
  const scenarioSet = new Set(scenarios);
  return {
    done: web.filter((name) => swiftSet.has(name)),
    missing: web.filter((name) => !swiftSet.has(name)),
    orphans: swift.filter((name) => !webSet.has(name)),
    unstoried: swift.filter((name) => !storySet.has(name)),
    untested: swift.filter((name) => !scenarioSet.has(name)),
  };
}

function main(): void {
  const result = coverage(webComponents(), swiftComponents(), storyNames(), scenarioFiles());
  const problems = [
    ...result.orphans.map((name) => `N${name}.swift has no ui/web component named ${name}`),
    ...result.unstoried.map((name) => `N${name} has no story in Sources/NibtreeShowcase/Stories.swift`),
    ...result.untested.map((name) => `N${name} has no parity scenarios in ui/swift/parity/${name}.json`),
  ];
  if (!process.argv.includes("--check")) {
    console.log(`Still to build in Swift (${result.missing.length}):`);
    console.log(result.missing.join(", "));
    console.log("");
  }
  console.log(
    `${result.done.length} of ${result.done.length + result.missing.length} components in Swift; ` +
      `${result.missing.length} left.`,
  );
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
