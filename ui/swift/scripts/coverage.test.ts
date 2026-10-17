import { describe, expect, it } from "vitest";
import { coverage, scenarioFiles, storyNames, swiftComponents, webComponents } from "./coverage";

describe("Swift UI library coverage", () => {
  it("finds the web components and the Swift ones", () => {
    expect(webComponents().length).toBeGreaterThan(100);
    expect(swiftComponents()).toContain("Text");
  });

  it("names every Swift component after a web component and gives it a story and parity scenarios", () => {
    const result = coverage(webComponents(), swiftComponents(), storyNames(), scenarioFiles());
    expect(result.orphans).toEqual([]);
    expect(result.unstoried).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  it("sorts components into done, missing, orphaned and unstoried", () => {
    expect(coverage(["Button", "Text"], ["Text", "Thing"], ["Text"], ["Text"])).toEqual({
      done: ["Text"],
      missing: ["Button"],
      orphans: ["Thing"],
      unstoried: ["Thing"],
      untested: ["Thing"],
    });
    expect(storyNames('Story("Stack", group: "Layout") {} Story("Text", group: "Content")')).toEqual(["Stack", "Text"]);
  });
});
