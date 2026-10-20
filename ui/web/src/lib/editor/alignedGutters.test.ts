import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { signLines } from "./alignedGutters";
import { splitChunkLines } from "./splitGutters";

const a = Text.of(["one", "two", "three", "four", "five", ""]);
const b = Text.of(["one", "TWO", "three", "four", ""]);
const chunks = Chunk.build(a, b);

describe("signLines", () => {
  it("signs every changed line of each side", () => {
    expect(signLines(chunks.map((chunk, index) => splitChunkLines(a, chunk, "a", index)))).toEqual([1, 4]);
    expect(signLines(chunks.map((chunk, index) => splitChunkLines(b, chunk, "b", index)))).toEqual([1]);
  });

  it("signs nothing where a side has no lines of a change", () => {
    const before = Text.of(["one", "two"]);
    const after = Text.of(["one", "new", "two"]);
    const [added] = Chunk.build(before, after);
    expect(signLines([splitChunkLines(before, added, "a", 0)])).toEqual([]);
    expect(signLines([splitChunkLines(after, added, "b", 0)])).toEqual([1]);
  });
});
