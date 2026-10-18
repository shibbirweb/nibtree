import { describe, expect, it } from "vitest";
import type { Scenario } from "../../../../swift/scripts/parity/scenario";
import { componentDocs } from "../../lib/docs";
import { icons } from "../../lib/icons";
import { prop } from "../../lib/docs/types";
import { propControl, propControls } from "./propControls";
import {
  firstPathOf,
  kebab,
  newScenario,
  nodeAt,
  scenariosUsing,
  treeRows,
  uniqueId,
  updateNode,
  withProp,
} from "./scenarioEdit";

const scenario: Scenario = {
  id: "split",
  width: 320,
  node: {
    component: "Stack",
    props: { gap: "sm" },
    children: [
      { component: "Text", text: "Title" },
      {
        component: "SplitPane",
        props: { size: 120 },
        slots: { first: [{ component: "Icon", props: { name: "x" } }], second: [{ component: "Text", text: "B" }] },
      },
    ],
  },
};

describe("propControl", () => {
  it("makes unions choices, with null as an empty choice and booleans in a mixed union", () => {
    expect(propControl(prop("tone", '"dim" | "faint" | null', "", { default: "null" }))).toEqual({
      kind: "choice",
      name: "tone",
      values: ["dim", "faint"],
      nullable: true,
      fallback: null,
      required: false,
    });
    const shrink = propControl(prop("shrink", 'boolean | "first"', "", { default: "false" }));
    expect(shrink).toMatchObject({ kind: "choice", values: [false, true, "first"], fallback: false });
  });

  it("lists the values of named types", () => {
    const name = propControl(prop("name", "IconName", "", { required: true }));
    expect(name).toMatchObject({ kind: "choice", values: Object.keys(icons), fallback: null, required: true });
  });

  it("makes flags, numbers, text and objects, and skips snippets and callbacks", () => {
    expect(propControl(prop("grow", "boolean", "", { default: "true" }))).toMatchObject({ fallback: true });
    expect(propControl(prop("size", "number | null", ""))).toMatchObject({ kind: "number", fallback: null });
    expect(propControl(prop("label", "string", "", { default: '"Go"' }))).toMatchObject({ fallback: "Go" });
    expect(propControl(prop("labels", "{ left; result; right }", ""))).toMatchObject({ kind: "json" });
    expect(propControl(prop("children", "Snippet", ""))).toBeNull();
    expect(propControl(prop("onclick", "() => void", ""))).toBeNull();
  });

  it("has a control for every prop of Stack, Text and Icon that a scenario sets", () => {
    for (const name of ["Stack", "Text", "Icon", "Divider", "SplitPane"]) {
      const doc = componentDocs.find((one) => one.name === name);
      const names = propControls(doc?.props ?? []).map((control) => control.name);
      expect(names.length, name).toBeGreaterThan(0);
    }
  });
});

describe("scenario editing", () => {
  it("finds nodes in children and slots and lists the tree depth first", () => {
    expect(
      nodeAt(scenario.node, [
        { slot: null, index: 1 },
        { slot: "first", index: 0 },
      ])?.component,
    ).toBe("Icon");
    expect(treeRows(scenario.node).map((row) => `${row.depth} ${row.label}`)).toEqual([
      "0 Stack gap=sm",
      '1 Text "Title"',
      "1 SplitPane size=120",
      "2 first: Icon name=x",
      '2 second: Text "B"',
    ]);
    expect(firstPathOf(scenario.node, "Icon")).toEqual([
      { slot: null, index: 1 },
      { slot: "first", index: 0 },
    ]);
    expect(firstPathOf(scenario.node, "Divider")).toEqual([]);
  });

  it("sets and removes a prop without touching the original", () => {
    const path = [
      { slot: null, index: 1 },
      { slot: "first", index: 0 },
    ];
    const changed = updateNode(scenario, path, (node) => withProp(node, "size", "huge"));
    expect(nodeAt(changed.node, path)?.props).toEqual({ name: "x", size: "huge" });
    expect(nodeAt(scenario.node, path)?.props).toEqual({ name: "x" });
    const removed = updateNode(changed, [], (node) => withProp(node, "gap", undefined));
    expect(removed.node.props).toBeUndefined();
    expect(updateNode(scenario, [{ slot: "nope", index: 0 }], (node) => node)).toBe(scenario);
  });

  it("finds a component's scenarios and starts a new one with unique ids", () => {
    expect(scenariosUsing("Icon", [scenario]).map((one) => one.id)).toEqual(["split"]);
    expect(scenariosUsing("Divider", [scenario])).toEqual([]);
    expect(kebab("MergeStackFrame")).toBe("merge-stack-frame");
    expect(uniqueId("icon-new", new Set(["icon-new", "icon-new-2"]))).toBe("icon-new-3");
    const icon = componentDocs.find((one) => one.name === "Icon");
    const fresh = newScenario("Icon", propControls(icon?.props ?? []), new Set());
    expect(fresh).toEqual({
      id: "icon-new",
      width: 320,
      node: { component: "Icon", props: { name: "chevron-right" } },
    });
  });
});
