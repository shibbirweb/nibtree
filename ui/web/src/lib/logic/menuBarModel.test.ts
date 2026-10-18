import { describe, expect, it } from "vitest";
import { barKey, stepMenu } from "./menuBarModel";

describe("menu bar model", () => {
  it("steps along the bar and wraps at both ends", () => {
    expect(stepMenu(3, 0, 1)).toBe(1);
    expect(stepMenu(3, 2, 1)).toBe(0);
    expect(stepMenu(3, 0, -1)).toBe(2);
    expect(stepMenu(0, 0, 1)).toBe(-1);
  });

  it("maps the keys of a top button", () => {
    expect(barKey("ArrowRight")).toEqual({ move: 1 });
    expect(barKey("ArrowLeft")).toEqual({ move: -1 });
    expect(barKey("Home")).toEqual({ first: true });
    expect(barKey("End")).toEqual({ last: true });
    for (const key of ["ArrowDown", "Enter", " "]) {
      expect(barKey(key)).toEqual({ open: true });
    }
    expect(barKey("a")).toBeNull();
  });
});
