// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { chunkLenses, type LensItem } from "./chunkLens";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function lensRows(items: LensItem[]): HTMLElement[] {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: "one\ntwo\nthree", extensions: chunkLenses(() => items) }),
  });
  return [...view.dom.querySelectorAll<HTMLElement>(".cm-mc-lens")];
}

describe("chunkLenses", () => {
  it("draws a note and links, split by bars, above the chunk's line", () => {
    const ran: string[] = [];
    const [row] = lensRows([
      {
        line: 1,
        kind: "conflict",
        note: "No changes accepted",
        actions: [{ label: "Accept", run: () => ran.push("accept") }],
      },
    ]);
    expect(row.textContent).toBe("No changes accepted|Accept");
    expect(row.className).toContain("cm-mc-lens-conflict");
    row.querySelector("button")?.click();
    expect(ran).toEqual(["accept"]);
  });

  it("draws one row per item", () => {
    expect(
      lensRows([
        { line: 0, kind: "modified", actions: [{ label: "Accept", run: () => {} }] },
        { line: 2, kind: "added", actions: [{ label: "Ignore", run: () => {} }] },
      ]),
    ).toHaveLength(2);
  });
});
