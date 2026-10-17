// @vitest-environment happy-dom
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { type FoldRowEdge, FoldRowWidget } from "./foldRow";

function row(top: boolean, bottom: boolean, name: string | null = null) {
  const opened: FoldRowEdge[] = [];
  const widget = new FoldRowWidget(40, top, bottom, 12, 10, {
    label: () => name,
    open: (_view, _row, edge) => opened.push(edge),
  });
  const element = widget.toDOM({} as EditorView);
  return { element, opened };
}

describe("FoldRowWidget", () => {
  it("puts its step buttons first, always, then the label and the wave", () => {
    const { element } = row(true, true, "Cart > remove()");
    expect([...element.children].map((child) => child.className)).toEqual([
      "cm-diffFoldStep",
      "cm-diffFoldStep",
      "cm-diffFoldLabel",
      "cm-diffFoldWave",
    ]);
    expect([...element.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "10 more from the top",
      "10 more from the bottom",
    ]);
    expect(element.querySelector(".cm-diffFoldLabel")?.textContent).toBe("Cart > remove()");
  });

  it("names the count when the code has no name, and shows only the ends it has", () => {
    const { element } = row(false, true);
    expect(element.querySelector(".cm-diffFoldLabel")?.textContent).toBe("40 unchanged lines");
    expect(element.querySelectorAll("button")).toHaveLength(1);
  });

  it("opens one end from a button and all of it from the row", () => {
    const { element, opened } = row(true, true);
    element.querySelectorAll("button")[1].click();
    element.click();
    expect(opened).toEqual(["bottom", "all"]);
  });
});
