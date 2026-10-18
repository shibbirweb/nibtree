// Editing a parity scenario in the compare tool: finding a node in its tree, setting a prop, and starting or naming
// a scenario. Every change returns a new scenario, so the page's state is replaced, never mutated.
import type { PropValue, Scenario, ScenarioNode } from "../../../../swift/scripts/parity/scenario";
import { componentsOf } from "../../../../swift/scripts/parity/scenario";
import type { InteractionState } from "../../lib/logic/forcedState";
import type { PropControl } from "./propControls";

/** One step down the tree: a child (slot null) or a node in a named slot. */
export interface PathStep {
  slot: string | null;
  index: number;
}

export type NodePath = PathStep[];

export interface TreeRow {
  path: NodePath;
  depth: number;
  label: string;
}

function step(node: ScenarioNode, { slot, index }: PathStep): ScenarioNode | null {
  const list = slot === null ? node.children : node.slots?.[slot];
  return list?.[index] ?? null;
}

export function nodeAt(root: ScenarioNode, path: NodePath): ScenarioNode | null {
  let node: ScenarioNode | null = root;
  for (const one of path) {
    node = node === null ? null : step(node, one);
  }
  return node;
}

/** The scenario with the node at `path` replaced by `change(node)`; unchanged when there is no such node. */
export function updateNode(scenario: Scenario, path: NodePath, change: (node: ScenarioNode) => ScenarioNode): Scenario {
  const copy = structuredClone(scenario);
  if (path.length === 0) {
    return { ...copy, node: change(copy.node) };
  }
  const parent = nodeAt(copy.node, path.slice(0, -1));
  const last = path[path.length - 1];
  const list = parent === null ? undefined : last.slot === null ? parent.children : parent.slots?.[last.slot];
  if (list === undefined || list[last.index] === undefined) {
    return scenario;
  }
  list[last.index] = change(list[last.index]);
  return copy;
}

/** The node with the prop set, or removed when `value` is undefined (the component's default then applies). */
export function withProp(node: ScenarioNode, name: string, value: PropValue | undefined): ScenarioNode {
  const props = { ...(node.props ?? {}) };
  if (value === undefined) {
    delete props[name];
  } else {
    props[name] = value;
  }
  const { props: _old, ...rest } = node;
  return Object.keys(props).length > 0 ? { ...rest, props } : rest;
}

/** The node drawn in a forced interaction state, or in none when `state` is undefined. */
export function withState(node: ScenarioNode, state: InteractionState | undefined): ScenarioNode {
  const { state: _old, ...rest } = node;
  return state === undefined ? rest : { ...rest, state };
}

/** A node's props in a few words: `name=settings size=huge`. */
function propSummary(node: ScenarioNode): string {
  return Object.entries(node.props ?? {})
    .map(([name, value]) => `${name}=${typeof value === "object" ? "{...}" : String(value)}`)
    .join(" ");
}

/** Every node of the tree, depth first, for the tree list: `Stack gap=sm`, `Text "Hello"`, `first: Icon name=x`. */
export function treeRows(root: ScenarioNode): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: ScenarioNode, path: NodePath, depth: number, slot: string | null) => {
    const text = node.text ? ` "${node.text.length > 24 ? `${node.text.slice(0, 24)}...` : node.text}"` : "";
    const props = `${propSummary(node)}${node.state ? ` [${node.state}]` : ""}`.trim();
    rows.push({ path, depth, label: `${slot ? `${slot}: ` : ""}${node.component}${text}${props ? ` ${props}` : ""}` });
    (node.children ?? []).forEach((child, index) => visit(child, [...path, { slot: null, index }], depth + 1, null));
    for (const [name, list] of Object.entries(node.slots ?? {})) {
      list.forEach((child, index) => visit(child, [...path, { slot: name, index }], depth + 1, name));
    }
  };
  visit(root, [], 0, null);
  return rows;
}

/** Where the component first appears in the tree, or the root when it does not. */
export function firstPathOf(root: ScenarioNode, component: string): NodePath {
  return treeRows(root).find((row) => nodeAt(root, row.path)?.component === component)?.path ?? [];
}

/** The scenarios that draw the component anywhere in their tree. */
export function scenariosUsing(component: string, scenarios: Scenario[]): Scenario[] {
  return scenarios.filter((scenario) => componentsOf(scenario.node).includes(component));
}

/** `MergeStackFrame` as `merge-stack-frame`. */
export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** `base`, or `base-2`, `base-3`... the first one not taken. */
export function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let count = 2; taken.has(id); count += 1) {
    id = `${base}-${count}`;
  }
  return id;
}

/** A fresh scenario of the component alone, its choices at their defaults (the first value when required). */
export function newScenario(component: string, controls: PropControl[], taken: Set<string>): Scenario {
  const props: Record<string, PropValue> = {};
  for (const control of controls) {
    if (control.kind === "choice" && control.fallback === null && !control.nullable) {
      props[control.name] = control.values[0];
    }
  }
  const node: ScenarioNode = Object.keys(props).length > 0 ? { component, props } : { component };
  return { id: uniqueId(`${kebab(component)}-new`, taken), width: 320, node };
}
