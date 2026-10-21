import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GIT_VIEW_ACTIONS } from "./menuIds";

describe("GIT_VIEW_ACTIONS", () => {
  it("lists exactly the Git actions menuActions.ts runs without waiting for a busy git command", () => {
    const source = readFileSync(new URL("./menuActions.ts", import.meta.url), "utf8");
    const notWaiting = [...source.matchAll(/"(git\.[a-zA-Z.]+)": (\w+)\(/g)]
      .filter((match) => match[2] !== "git")
      .map((match) => match[1])
      .sort();
    expect(notWaiting).toEqual([...GIT_VIEW_ACTIONS].sort());
  });
});
