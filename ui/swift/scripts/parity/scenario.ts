// The scenarios both libraries draw for the parity check (ui/swift/parity/<Component>.json): a component tree with
// props as JSON values, at a fixed width. ui/web renders them in WebKit, ui/swift with SwiftUI, and the pictures and
// render times are compared (scripts/parity.ts).

export type PropValue = string | number | boolean;

export interface ScenarioNode {
  /** A ui/web component name; Swift draws its `N<Name>` twin. */
  component: string;
  props?: Record<string, PropValue>;
  /** The text inside (Text and other text components). */
  text?: string;
  children?: ScenarioNode[];
  /** Named content, for components that take it as snippets (SplitPane's first and second). */
  slots?: Record<string, ScenarioNode[]>;
}

export interface Scenario {
  /** Unique across all files: `<component>-<case>`, used for file names. */
  id: string;
  /** Points (CSS pixels) wide; the height is the content's. */
  width: number;
  /** Points high, for components that fill their parent (frames, split panes); left out, the content's. */
  height?: number;
  node: ScenarioNode;
}

/** A node's nested nodes: its children and every slot's content. */
export function nestedNodes(node: ScenarioNode): ScenarioNode[] {
  return [...(node.children ?? []), ...Object.values(node.slots ?? {}).flat()];
}

/** Every component a scenario uses, nested ones included. */
export function componentsOf(node: ScenarioNode): string[] {
  return [node.component, ...nestedNodes(node).flatMap(componentsOf)];
}

/** Problems with a scenario file's content: missing fields, duplicate ids, unknown components. */
export function scenarioProblems(file: string, scenarios: unknown, known: Set<string>, seen: Set<string>): string[] {
  if (!Array.isArray(scenarios)) {
    return [`${file}: not a list of scenarios`];
  }
  const problems: string[] = [];
  for (const scenario of scenarios as Scenario[]) {
    if (typeof scenario?.id !== "string" || typeof scenario.width !== "number" || !scenario.node) {
      problems.push(`${file}: a scenario needs id, width and node`);
      continue;
    }
    if (seen.has(scenario.id)) {
      problems.push(`${file}: duplicate id ${scenario.id}`);
    }
    seen.add(scenario.id);
    for (const component of componentsOf(scenario.node)) {
      if (!known.has(component)) {
        problems.push(`${file}: ${scenario.id} uses ${component}, which has no Swift twin yet`);
      }
    }
  }
  return problems;
}
