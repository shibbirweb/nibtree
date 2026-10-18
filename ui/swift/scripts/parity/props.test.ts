import { describe, expect, it } from "vitest";
import { enumCases, harnessProps, propProblems, stateProblems, swiftProps, triedValues } from "./props";
import type { Scenario } from "./scenario";

const source = `
public enum NBoxSide: String, CaseIterable, Sendable { case left, right }

public struct NBox: View {
    public typealias Side = NBoxSide
    public enum Tone: String, CaseIterable, Sendable {
        case \`default\`, dim
        case loud

        var token: String {
            switch self {
            case .default: "text"
            case .dim, .loud: "textDim"
            }
        }
    }

    public init(
        _ content: String, side: Side = .left, tone: Tone? = nil, gap: NSpacing = .md, open: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
    }
}
`;

const harness = `
        case "Box":
            self = .box(side: node.string("side"), tone: node.string("tone"), gap: node.string("gap"))
        case "Other":
            self = .other(open: node.flag("open"))
        default:
`;

function scenario(id: string, props: Scenario["node"]["props"]): Scenario {
  return { id, width: 100, node: { component: "Stack", children: [{ component: "Box", props }] } };
}

describe("props", () => {
  it("reads enum cases on one line or several, without switch cases", () => {
    expect(enumCases(source, "NBoxSide")).toEqual(["left", "right"]);
    expect(enumCases(source, "Tone")).toEqual(["default", "dim", "loud"]);
    expect(enumCases(source, "Missing")).toBeNull();
  });

  it("reads labelled init props with their values; shared presets need the prop only", () => {
    expect(swiftProps(source)).toEqual([
      { name: "side", values: ["left", "right"] },
      { name: "tone", values: ["default", "dim", "loud"] },
      { name: "gap", values: [] },
      { name: "open", values: ["true"] },
    ]);
  });

  it("reads the named component's init, not a helper type's above it", () => {
    const withHelper = `public struct NBoxLabels {\n    public init(title: String) {\n    }\n}\n${source}`;
    expect(swiftProps(withHelper, "Box").map((prop) => prop.name)).toEqual(["side", "tone", "gap", "open"]);
    expect(swiftProps(withHelper)[0].name).toBe("title");
  });

  it("collects the values tried, nested nodes included", () => {
    const tried = triedValues([scenario("a", { side: "left", open: true })], "Box");
    expect([...(tried.get("side") ?? [])]).toEqual(["left"]);
    expect([...(tried.get("open") ?? [])]).toEqual(["true"]);
  });

  it("reports untried props and values, and props the harness does not read", () => {
    const scenarios = [scenario("a", { side: "left", tone: "dim", gap: "xs" }), scenario("b", { tone: "loud" })];
    expect(propProblems("Box", swiftProps(source), scenarios, harness)).toEqual([
      "Box: no scenario sets side to right",
      "Box: no scenario sets tone to default",
      "Box: the Swift harness (Parity/Groups) does not read open",
      "Box: no scenario sets open",
    ]);
  });

  it("passes when every prop and value is tried", () => {
    const scenarios = [
      scenario("a", { side: "left", tone: "default", gap: "xs" }),
      scenario("b", { side: "right", tone: "dim" }),
      scenario("c", { tone: "loud", open: true }),
    ];
    const withOpen = harness.replace('gap: node.string("gap")', 'gap: node.string("gap"), open: node.flag("open")');
    expect(propProblems("Box", swiftProps(source), scenarios, withOpen)).toEqual([]);
  });
});

describe("harnessProps", () => {
  it("lists the props the harness reads for one component only", () => {
    const harness = `
        case "Icon":
            self = .icon(node.string("name"), node.string("size").flatMap(NIconSize.init), node.flag("strong"))
        case "Spacer":
            self = .spacer(node.number("gap"))
        default:`;
    expect(harnessProps("Icon", harness)).toEqual(["name", "size", "strong"]);
    expect(harnessProps("Spacer", harness)).toEqual(["gap"]);
    expect(harnessProps("Divider", harness)).toEqual([]);
  });
});

describe("stateProblems", () => {
  const scenarios: Scenario[] = [
    {
      id: "a",
      width: 100,
      node: { component: "Stack", children: [{ component: "SplitHandle", state: "hover" }] },
    },
  ];

  it("asks for a scenario per listed state, nested nodes included", () => {
    expect(stateProblems("SplitHandle", ["hover"], scenarios)).toEqual([]);
    expect(stateProblems("SplitHandle", ["hover", "dragging"], scenarios)).toEqual([
      "SplitHandle: no scenario shows dragging",
    ]);
  });

  it("flags a forced state the component does not draw", () => {
    expect(stateProblems("SplitHandle", [], scenarios)).toEqual([
      "SplitHandle: a scenario forces hover, which its doc does not list in states",
    ]);
  });
});
