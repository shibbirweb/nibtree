import { describe, expect, it } from "vitest";
import type { Scenario } from "../../../../swift/scripts/parity/scenario";
import { prop } from "../../lib/docs/types";
import { propControls } from "./propControls";
import { nodeAt, treeRows, withState } from "./scenarioEdit";
import { valueGrid } from "./valueGrid";

const scenario: Scenario = {
  id: "split",
  width: 320,
  node: { component: "Stack", children: [{ component: "SplitHandle", props: { label: "Resize", ratio: 0.4 } }] },
};
const path = [{ slot: null, index: 0 }];

describe("valueGrid", () => {
  it("makes a cell per choice value (default first when it has none), per flag value and per state", () => {
    const controls = propControls([
      prop("tone", '"dim" | "accent"', ""),
      prop("strong", "boolean", "", { default: "true" }),
      prop("size", '"small" | "large"', "", { default: '"small"' }),
      prop("ratio", "number", ""),
    ]);
    const groups = valueGrid(scenario, path, controls, ["hover", "dragging"]);
    expect(groups.map((group) => `${group.name}: ${group.cells.map((cell) => cell.label).join(" ")}`)).toEqual([
      "tone: default dim accent",
      "strong: false true",
      "size: small large",
      "state: none hover dragging",
    ]);
  });

  it("offers no default cell for a required prop", () => {
    const groups = valueGrid(scenario, path, propControls([prop("name", '"a" | "b"', "", { required: true })]), []);
    expect(groups[0].cells.map((cell) => cell.label)).toEqual(["a", "b"]);
  });

  it("changes only the chosen node, and names each cell's scenario uniquely", () => {
    const groups = valueGrid(scenario, path, propControls([prop("tone", '"dim" | "accent"', "")]), ["hover"]);
    const cells = groups.flatMap((group) => group.cells);
    expect(new Set(cells.map((cell) => cell.scenario.id)).size).toBe(cells.length);
    expect(cells[1].scenario.id).toBe("split--tone-dim");
    expect(nodeAt(cells[1].scenario.node, path)?.props).toEqual({ label: "Resize", ratio: 0.4, tone: "dim" });
    expect(nodeAt(cells[4].scenario.node, path)?.state).toBe("hover");
    expect(scenario.node.children?.[0].props).toEqual({ label: "Resize", ratio: 0.4 });
  });

  it("sets and clears a forced state, and shows it in the tree", () => {
    const hovered = withState({ component: "SplitHandle" }, "hover");
    expect(hovered).toEqual({ component: "SplitHandle", state: "hover" });
    expect(withState(hovered, undefined)).toEqual({ component: "SplitHandle" });
    expect(treeRows(hovered)[0].label).toBe("SplitHandle [hover]");
  });
});
