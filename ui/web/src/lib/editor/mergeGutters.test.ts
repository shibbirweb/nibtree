import { Text } from "@codemirror/state";
import type { GutterMarker } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { gutterChunksOf } from "./chunks";
import { chunkGutterClasses, type GutterChunk } from "./mergeGutters";

const doc = Text.of(["one", "two", "three", "four", "five"]);

/** The class each line's gutter rows get, by 1-based line number. */
function classesByLine(chunks: GutterChunk[]): Map<number, string> {
  const found = new Map<number, string>();
  chunkGutterClasses(doc, chunks).between(0, doc.length, (from, _to, marker: GutterMarker) => {
    found.set(doc.lineAt(from).number, marker.elementClass);
  });
  return found;
}

describe("chunkGutterClasses", () => {
  it("colors every row of a chunk, with edges on its first and last", () => {
    const rows = classesByLine([{ index: 0, kind: "modified", start: 1, end: 4 }]);
    expect([...rows.keys()]).toEqual([2, 3, 4]);
    expect(rows.get(2)).toBe("cm-mc-gutter cm-mc-modified cm-mc-first");
    expect(rows.get(3)).toBe("cm-mc-gutter cm-mc-modified");
    expect(rows.get(4)).toBe("cm-mc-gutter cm-mc-modified cm-mc-last");
  });

  it("marks a one-line chunk single and adds its tone", () => {
    const rows = classesByLine([{ index: 0, kind: "added", start: 0, end: 1, tone: "new" }]);
    expect(rows.get(1)).toBe("cm-mc-gutter cm-mc-added cm-mc-new cm-mc-single");
  });

  it("draws an empty chunk as an edge before its line, or after the last line at the end", () => {
    expect(classesByLine([{ index: 0, kind: "deleted", start: 2, end: 2 }]).get(3)).toBe(
      "cm-mc-gap-before cm-mc-edge-deleted",
    );
    expect(classesByLine([{ index: 0, kind: "conflict", start: 5, end: 5 }]).get(5)).toBe(
      "cm-mc-gap-after cm-mc-edge-conflict",
    );
  });

  it("takes chunks in any order", () => {
    const rows = classesByLine([
      { index: 1, kind: "conflict", start: 3, end: 4 },
      { index: 0, kind: "added", start: 0, end: 1 },
    ]);
    expect([...rows.keys()]).toEqual([1, 4]);
  });
});

describe("gutterChunksOf", () => {
  it("keeps each chunk's place as its index and leaves out panes where it has no lines", () => {
    const chunks = [
      {
        kind: "modified" as const,
        left: [0, 1] as [number, number],
        result: [0, 1] as [number, number],
        right: [0, 0] as [number, number],
      },
      {
        kind: "added" as const,
        left: [2, 2] as [number, number],
        result: [1, 3] as [number, number],
        right: [1, 3] as [number, number],
      },
    ];
    expect(gutterChunksOf(chunks, "left")).toEqual([{ index: 0, kind: "modified", start: 0, end: 1 }]);
    expect(gutterChunksOf(chunks, "right")).toEqual([{ index: 1, kind: "added", start: 1, end: 3 }]);
  });
});
