import { describe, expect, it } from "vitest";
import { icons } from "../../web/src/lib/icons";
import { iconFilesSwift, swiftIconName } from "./icons";
import { arcToCurves, parsePath, type PathOp } from "./svgPath";

/** A point on a cubic curve at t. */
function curvePoint(from: { x: number; y: number }, curve: Extract<PathOp, { op: "C" }>, t: number) {
  const u = 1 - t;
  const blend = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return {
    x: blend(from.x, curve.x1, curve.x2, curve.x),
    y: blend(from.y, curve.y1, curve.y2, curve.y),
  };
}

describe("parsePath", () => {
  it("makes relative steps absolute and repeats a move as lines", () => {
    expect(parsePath("m9 18 6-6-6-6")).toEqual([
      { op: "M", x: 9, y: 18 },
      { op: "L", x: 15, y: 12 },
      { op: "L", x: 9, y: 6 },
    ]);
  });

  it("turns H and V into lines and returns to the start after Z", () => {
    expect(parsePath("M2 3h4v5H1V0zl1 1")).toEqual([
      { op: "M", x: 2, y: 3 },
      { op: "L", x: 6, y: 3 },
      { op: "L", x: 6, y: 8 },
      { op: "L", x: 1, y: 8 },
      { op: "L", x: 1, y: 0 },
      { op: "Z" },
      { op: "L", x: 3, y: 4 },
    ]);
  });

  it("reads numbers that run together", () => {
    expect(parsePath("M1.5.5-2-3")).toEqual([
      { op: "M", x: 1.5, y: 0.5 },
      { op: "L", x: -2, y: -3 },
    ]);
  });

  it("reflects the last handle for S, and uses the current point after a line", () => {
    expect(parsePath("M0 0C1 2 3 4 5 5S9 8 10 10")[2]).toEqual({ op: "C", x1: 7, y1: 6, x2: 9, y2: 8, x: 10, y: 10 });
    expect(parsePath("M0 0L5 5S9 8 10 10")[2]).toEqual({ op: "C", x1: 5, y1: 5, x2: 9, y2: 8, x: 10, y: 10 });
  });

  it("reads arc flags written together", () => {
    const together = parsePath("M0 0a5 5 0 015 5");
    expect(together).toEqual(parsePath("M0 0a5 5 0 0 1 5 5"));
  });

  it("refuses commands it cannot draw", () => {
    expect(() => parsePath("M0 0Q1 1 2 2")).toThrow(/Unsupported/);
  });
});

describe("arcToCurves", () => {
  it("draws a half circle as two quarter curves that stay on the circle", () => {
    const from = { x: 7, y: 12 };
    const curves = arcToCurves(from, { rx: 5, ry: 5, rotation: 0, large: true, sweep: false, x: 17, y: 12 });
    expect(curves).toHaveLength(2);
    let start = from;
    for (const curve of curves as Extract<PathOp, { op: "C" }>[]) {
      for (const t of [0.25, 0.5, 0.75]) {
        const point = curvePoint(start, curve, t);
        expect(Math.hypot(point.x - 12, point.y - 12)).toBeCloseTo(5, 2);
      }
      start = { x: curve.x, y: curve.y };
    }
    // Sweep 0 from the left goes through the bottom (y grows downward).
    expect((curves[0] as Extract<PathOp, { op: "C" }>).y).toBeCloseTo(17, 6);
    expect(start).toEqual({ x: 17, y: 12 });
  });

  it("grows radii too small to reach the end, and skips an arc to its own start", () => {
    const curves = arcToCurves({ x: 0, y: 0 }, { rx: 1, ry: 1, rotation: 0, large: false, sweep: true, x: 10, y: 0 });
    expect(curves).toHaveLength(2);
    const toItself = { rx: 2, ry: 2, rotation: 0, large: false, sweep: true, x: 3, y: 3 };
    expect(arcToCurves({ x: 3, y: 3 }, toItself)).toEqual([]);
  });
});

describe("icon files", () => {
  it("parses every library icon and names each one for Swift", () => {
    for (const [name, paths] of Object.entries(icons)) {
      expect(paths.flatMap(parsePath).length, name).toBeGreaterThan(1);
    }
    expect(swiftIconName("chevron-right")).toBe("chevronRight");
    expect(swiftIconName("default")).toBe("`default`");
  });

  it("keeps every generated file within 300 lines of 120 columns", () => {
    for (const file of iconFilesSwift()) {
      const lines = file.content.split("\n");
      expect(lines.length, file.name).toBeLessThanOrEqual(300);
      expect(lines.filter((line) => line.length > 120), file.name).toEqual([]);
    }
  });
});
