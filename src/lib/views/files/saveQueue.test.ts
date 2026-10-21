import { describe, expect, it } from "vitest";
import { whenIdle } from "./saveQueue";

describe("whenIdle", () => {
  it("answers at once when nothing is saving", async () => {
    expect(await whenIdle(() => false)).toBe(true);
  });

  it("waits for the running save to finish", async () => {
    let checks = 0;
    expect(await whenIdle(() => ++checks < 3, 1)).toBe(true);
    expect(checks).toBe(3);
  });

  it("gives up when the save never finishes", async () => {
    expect(await whenIdle(() => true, 1, 5)).toBe(false);
  });
});
