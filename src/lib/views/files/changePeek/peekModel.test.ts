import { describe, expect, it } from "vitest";
import {
  changeIndexAt,
  hunkKind,
  peekChanges,
  peekCounter,
  peekLine,
  stagedText,
  stepIndex,
  viewHunks,
} from "./peekModel";

const base = "one\ntwo\nthree\nfour\nfive\n";
const doc = "ONE\ntwo\nthree\nnew\nfour\n";

describe("peekChanges", () => {
  const hunks = peekChanges(base, doc);

  it("finds each change with its kind", () => {
    expect(hunks.map(hunkKind)).toEqual(["modified", "added", "deleted"]);
    expect(viewHunks(hunks)).toEqual([
      [0, 1, 0, 1],
      [3, 3, 3, 4],
      [4, 5, 5, 5],
    ]);
  });

  it("finds the change on a line, and a deletion from the line below it", () => {
    const lines = doc.split("\n").length;
    expect(changeIndexAt(hunks, 0, lines)).toBe(0);
    expect(changeIndexAt(hunks, 3, lines)).toBe(1);
    expect(changeIndexAt(hunks, 5, lines)).toBe(2);
    expect(changeIndexAt(hunks, 1, lines)).toBe(-1);
  });

  it("opens under a change's last line, or above a deletion", () => {
    const lines = doc.split("\n").length;
    expect(peekLine(hunks[0], lines)).toBe(0);
    expect(peekLine(hunks[1], lines)).toBe(3);
    expect(peekLine(hunks[2], lines)).toBe(4);
    expect(peekLine({ oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 0 }, lines)).toBe(0);
  });
});

describe("stagedText", () => {
  const hunks = peekChanges(base, doc);

  it("stages one change and keeps the others out", () => {
    expect(stagedText(base, doc, hunks[0])).toBe("ONE\ntwo\nthree\nfour\nfive\n");
    expect(stagedText(base, doc, hunks[1])).toBe("one\ntwo\nthree\nnew\nfour\nfive\n");
    expect(stagedText(base, doc, hunks[2])).toBe("one\ntwo\nthree\nfour\n");
  });

  it("stages a new file's lines and a last line without a line break", () => {
    const [added] = peekChanges("", "x\n");
    expect(stagedText("", "x\n", added)).toBe("x\n");
    const [tail] = peekChanges("a\nb", "a\nb\nc");
    expect(stagedText("a\nb", "a\nb\nc", tail)).toBe("a\nb\nc");
  });
});

describe("counter and steps", () => {
  it("counts and wraps", () => {
    expect(peekCounter(1, 4)).toBe("2 of 4 changes");
    expect(peekCounter(0, 1)).toBe("1 of 1 change");
    expect(stepIndex(3, 4, 1)).toBe(0);
    expect(stepIndex(0, 4, -1)).toBe(3);
  });
});
