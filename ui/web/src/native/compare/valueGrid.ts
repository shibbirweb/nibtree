// The compare tool's "All values" view: the scenario once per value of each prop of one node, and once per state it
// draws, each a scenario of its own so both libraries draw it and the gate's numbers apply per cell.
import type { Scenario } from "../../../../swift/scripts/parity/scenario";
import type { InteractionState } from "../../lib/logic/forcedState";
import type { PropControl } from "./propControls";
import { updateNode, withProp, withState, type NodePath } from "./scenarioEdit";

export interface GridCell {
  label: string;
  scenario: Scenario;
}

export interface GridGroup {
  /** The prop's name, or "state". */
  name: string;
  cells: GridCell[];
}

/** A value as part of a scenario id: `chevron-right`, `true`, `default`. */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase();
}

/** One group per choice or flag prop, then the states: each value in its own copy of the scenario. */
export function valueGrid(
  scenario: Scenario,
  path: NodePath,
  controls: PropControl[],
  states: readonly InteractionState[],
): GridGroup[] {
  const cell = (group: string, label: string, change: Parameters<typeof updateNode>[2]): GridCell => ({
    label,
    scenario: { ...updateNode(scenario, path, change), id: `${scenario.id}--${idPart(group)}-${idPart(label)}` },
  });
  const groups: GridGroup[] = [];
  for (const control of controls) {
    if (control.kind === "choice") {
      const values = control.values.map((value) =>
        cell(control.name, String(value), (node) => withProp(node, control.name, value)),
      );
      const unset =
        control.fallback === null && !control.required
          ? [cell(control.name, "default", (node) => withProp(node, control.name, undefined))]
          : [];
      groups.push({ name: control.name, cells: [...unset, ...values] });
    } else if (control.kind === "flag") {
      groups.push({
        name: control.name,
        cells: [false, true].map((value) =>
          cell(control.name, String(value), (node) => withProp(node, control.name, value)),
        ),
      });
    }
  }
  if (states.length > 0) {
    groups.push({
      name: "state",
      cells: [
        cell("state", "none", (node) => withState(node, undefined)),
        ...states.map((state) => cell("state", state, (node) => withState(node, state))),
      ],
    });
  }
  return groups;
}
