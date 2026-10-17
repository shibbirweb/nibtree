import { describe, expect, it } from "vitest";
import { resultLenses } from "./mergeLayout";
import type { ChunkState } from "./model";

function chunk(id: number, kind: ChunkState["kind"], done: Partial<Pick<ChunkState, "oursDone" | "theirsDone">>) {
  const range = { start: id * 4, end: id * 4 + 1 };
  return {
    id,
    kind,
    base: range,
    ours: range,
    theirs: range,
    result: range,
    oursDone: false,
    theirsDone: false,
    applied: false,
    edited: false,
    ...done,
  } as ChunkState;
}

describe("resultLenses", () => {
  it("notes what each open conflict has taken, above its first line", () => {
    const lenses = resultLenses([
      chunk(0, "conflict", {}),
      chunk(1, "conflict", { oursDone: true }),
      chunk(2, "conflict", { theirsDone: true }),
    ]);
    expect(lenses.map((lens) => [lens.line, lens.note])).toEqual([
      [0, "No changes accepted"],
      [4, "Left side taken"],
      [8, "Right side taken"],
    ]);
  });

  it("leaves out resolved conflicts and changes that are not conflicts", () => {
    expect(
      resultLenses([chunk(0, "conflict", { oursDone: true, theirsDone: true }), chunk(1, "oursOnly", {})]),
    ).toEqual([]);
  });
});
