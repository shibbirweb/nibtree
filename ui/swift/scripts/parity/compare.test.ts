import { describe, expect, it } from "vitest";
import { best, compare, MIN_MATCH, verdict, type Picture } from "./compare";
import { componentsOf, scenarioProblems } from "./scenario";

/** A width x height picture of one gray value, with `marks` drawn black. */
function picture(width: number, height: number, marks: [number, number][] = []): Picture {
  const data = new Array(width * height * 4).fill(255);
  for (const [x, y] of marks) {
    data.splice((y * width + x) * 4, 3, 0, 0, 0);
  }
  return { width, height, data };
}

describe("compare", () => {
  it("matches equal pictures fully", () => {
    expect(compare(picture(4, 4, [[1, 1]]), picture(4, 4, [[1, 1]]))).toEqual({
      ratio: 1,
      strict: 1,
      exact: 1,
      sameSize: true,
    });
  });

  it("forgives a mark one pixel apart but counts it at the same spot", () => {
    const match = compare(picture(4, 4, [[1, 1]]), picture(4, 4, [[2, 1]]));
    expect(match.ratio).toBe(1);
    expect(match.strict).toBe(14 / 16);
  });

  it("does not forgive a mark two pixels apart", () => {
    expect(compare(picture(5, 1, [[0, 0]]), picture(5, 1, [[2, 0]])).ratio).toBe(3 / 5);
  });

  it("fails pictures of different sizes", () => {
    expect(compare(picture(4, 4), picture(4, 5))).toMatchObject({ ratio: 0, sameSize: false });
  });
});

describe("verdict", () => {
  const full = { ratio: 1, strict: 1, exact: 1, sameSize: true };

  it("passes a full match that is faster", () => {
    expect(verdict("a", [full, full], 10, 5).problems).toEqual([]);
  });

  it("fails below the minimum match, near or at the same spot, a different size, or a Swift render not faster", () => {
    const low = { ...full, ratio: MIN_MATCH - 0.001 };
    expect(verdict("a", [full, low], 10, 5).problems).toHaveLength(1);
    const shifted = { ...full, strict: MIN_MATCH - 0.001 };
    expect(verdict("a", [shifted, full], 10, 5).problems).toEqual(["matches 98.90% at the same spot, needs 99%"]);
    expect(verdict("a", [{ ...full, ratio: 0, sameSize: false }], 10, 5).problems).toHaveLength(2);
    expect(verdict("a", [full], 10, 10).problems).toEqual(["Swift 10.0 ms is not faster than web 10.0 ms"]);
  });

  it("checks only what a one-check run measured", () => {
    expect(verdict("a", [full, full]).problems).toEqual([]);
    expect(verdict("a", [], 10, 5).problems).toEqual([]);
    expect(verdict("a", [], 10, 12).problems).toHaveLength(1);
    expect(verdict("a", [], Number.NaN, 5).problems).toHaveLength(1);
  });

  it("takes the fastest run", () => {
    expect(best([3, 1, 2])).toBe(1);
    expect(best([])).toBeNaN();
  });
});

describe("scenarios", () => {
  it("lists nested components", () => {
    expect(componentsOf({ component: "Stack", children: [{ component: "Text", text: "a" }] })).toEqual([
      "Stack",
      "Text",
    ]);
  });

  it("reports missing fields, duplicates and components without a Swift twin", () => {
    const seen = new Set<string>();
    const known = new Set(["Text"]);
    expect(scenarioProblems("a.json", {}, known, seen)).toEqual(["a.json: not a list of scenarios"]);
    const scenarios = [
      { id: "x", width: 10, node: { component: "Text" } },
      { id: "x", width: 10, node: { component: "Button" } },
    ];
    expect(scenarioProblems("a.json", scenarios, known, seen)).toEqual([
      "a.json: duplicate id x",
      "a.json: x uses Button, which has no Swift twin yet",
    ]);
  });
});
