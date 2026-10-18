// Which props a Swift component has, read from its source, and whether the parity scenarios try every one: each
// prop at least once, every value of the component's own enums, and `true` for each flag. Values of shared presets
// (NSpacing and the like) need the prop only; the token tests cover their steps.

import { nestedNodes, type PropValue, type Scenario, type ScenarioNode } from "./scenario";

export interface SwiftProp {
  name: string;
  /** The values every one of which a scenario must use: enum cases, `true` for a flag, none for a shared preset. */
  values: string[];
}

/** The text of the block that starts at `open` (an opening brace), braces included. */
function block(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open, index + 1);
      }
    }
  }
  return source.slice(open);
}

/** The cases of `enum <name>: String` in the source, or null when it is not defined there. */
export function enumCases(source: string, name: string): string[] | null {
  const found = new RegExp(`enum ${name}\\s*:\\s*String[^{]*\\{`).exec(source);
  if (!found) {
    return null;
  }
  const body = block(source, found.index + found[0].length - 1);
  return body
    .slice(1, -1)
    .split(/\n|;/)
    .map((line) => /^\s*case\s+([^.].*)$/.exec(line)?.[1] ?? "")
    .flatMap((list) => list.split(","))
    .map((value) => value.replaceAll("`", "").trim())
    .filter((value) => /^\w+$/.test(value));
}

/**
 * The labelled props of the component's first `public init(` (after `struct N<component>` when it is named, so helper
 * types above it, such as a labels struct, are not read); the unlabelled text and builders skip.
 */
export function swiftProps(source: string, component = ""): SwiftProp[] {
  const own = component ? source.search(new RegExp(`struct N${component}\\b`)) : -1;
  const start = source.indexOf("public init(", Math.max(own, 0));
  if (start < 0) {
    return [];
  }
  const close = source.indexOf(") {", start);
  const list = source.slice(start + "public init(".length, close);
  const aliases = new Map([...source.matchAll(/typealias (\w+) = (\w+)/g)].map((match) => [match[1], match[2]]));
  const props: SwiftProp[] = [];
  for (const param of list.split(",")) {
    const found = /^\s*(?:@\w+\s+)?(\w+)\s*:\s*([\w.]+)\??/.exec(param);
    if (!found || param.includes("->")) {
      continue;
    }
    const [, name, written] = found;
    const type = aliases.get(written) ?? written.split(".").pop() ?? written;
    const values = type === "Bool" ? ["true"] : (enumCases(source, type) ?? []);
    props.push({ name, values });
  }
  return props;
}

/** Every value each prop of `component` takes in the scenarios, nested nodes included, as text. */
export function triedValues(scenarios: Scenario[], component: string): Map<string, Set<string>> {
  const tried = new Map<string, Set<string>>();
  const visit = (node: ScenarioNode) => {
    if (node.component === component) {
      for (const [name, value] of Object.entries(node.props ?? {}) as [string, PropValue][]) {
        tried.set(name, (tried.get(name) ?? new Set()).add(String(value)));
      }
    }
    nestedNodes(node).forEach(visit);
  };
  scenarios.forEach((scenario) => visit(scenario.node));
  return tried;
}

/** Props and values of `component` that no scenario tries, and props the Swift harness does not read. */
export function propProblems(component: string, props: SwiftProp[], scenarios: Scenario[], harness: string): string[] {
  const tried = triedValues(scenarios, component);
  const problems: string[] = [];
  const caseStart = harness.indexOf(`case "${component}":`);
  const nextCase = harness.slice(caseStart + 1).search(/case "|default:/);
  const mapping = caseStart < 0 ? "" : harness.slice(caseStart, nextCase < 0 ? undefined : caseStart + 1 + nextCase);
  for (const prop of props) {
    if (!mapping.includes(`"${prop.name}"`)) {
      problems.push(`${component}: the Swift harness (ScenarioView.swift) does not read ${prop.name}`);
    }
    const values = tried.get(prop.name);
    if (!values) {
      problems.push(`${component}: no scenario sets ${prop.name}`);
      continue;
    }
    const missing = prop.values.filter((value) => !values.has(value));
    if (missing.length > 0) {
      problems.push(`${component}: no scenario sets ${prop.name} to ${missing.join(", ")}`);
    }
  }
  return problems;
}
