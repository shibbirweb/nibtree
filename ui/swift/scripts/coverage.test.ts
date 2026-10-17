import { describe, expect, it } from "vitest";
import { coverage, storyNames, swiftComponents, webComponents } from "./coverage";

describe("Swift UI library coverage", () => {
  it("finds the web components and the Swift ones", () => {
    expect(webComponents().length).toBeGreaterThan(100);
    expect(swiftComponents()).toContain("Text");
  });

  it("names every Swift component after a web component and gives it a story", () => {
    const result = coverage(webComponents(), swiftComponents(), storyNames());
    expect(result.orphans).toEqual([]);
    expect(result.unstoried).toEqual([]);
  });

  it("sorts components into done, missing, orphaned and unstoried", () => {
    expect(coverage(["Button", "Text"], ["Text", "Thing"], ["Text"])).toEqual({
      done: ["Text"],
      missing: ["Button"],
      orphans: ["Thing"],
      unstoried: ["Thing"],
    });
    expect(storyNames('Story("Stack", group: "Layout") {} Story("Text", group: "Content")')).toEqual(["Stack", "Text"]);
  });
});
