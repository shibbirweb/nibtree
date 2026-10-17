import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { splitChunkLines } from "./splitGutters";

const a = Text.of(["one", "two", "three", "four"]);
const b = Text.of(["one", "TWO", "three", "four", "five"]);

describe("splitChunkLines", () => {
  it("gives a changed line its rows on both sides, old and new", () => {
    const [changed] = Chunk.build(a, b);
    expect(splitChunkLines(a, changed, "a", 0)).toEqual({ index: 0, kind: "modified", start: 1, end: 2, tone: "old" });
    expect(splitChunkLines(b, changed, "b", 0)).toEqual({ index: 0, kind: "modified", start: 1, end: 2, tone: "new" });
  });

  it("marks added lines as a gap on the side that has none", () => {
    const before = Text.of(["one", "two"]);
    const after = Text.of(["one", "new", "two"]);
    const [added] = Chunk.build(before, after);
    expect(splitChunkLines(after, added, "b", 0)).toMatchObject({ kind: "added", start: 1, end: 2 });
    expect(splitChunkLines(before, added, "a", 0)).toMatchObject({ kind: "added", start: 1, end: 1 });
  });

  it("marks removed lines as a gap on the new side", () => {
    const before = Text.of(["one", "two", "three"]);
    const after = Text.of(["one", "three"]);
    const [removed] = Chunk.build(before, after);
    expect(splitChunkLines(before, removed, "a", 0)).toMatchObject({ kind: "deleted", start: 1, end: 2 });
    expect(splitChunkLines(after, removed, "b", 0)).toMatchObject({ kind: "deleted", start: 1, end: 1 });
  });
});
