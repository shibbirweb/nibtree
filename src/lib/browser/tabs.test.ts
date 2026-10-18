import { describe, expect, it } from "vitest";

import { tabOpenFrom, tabUrl } from "./tabs";

describe("browser tabs", () => {
  it("puts what a tab shows in its address and reads it back", () => {
    const open = { folderPaths: ["/Users/me/code/app", "/Users/me/code/lib"], workspaceFile: null };
    const url = tabUrl("http://127.0.0.1:4300/?old=1#x", open);
    expect(url.startsWith("http://127.0.0.1:4300/?open=")).toBe(true);
    expect(url).not.toContain("old=1");
    expect(tabOpenFrom(new URL(url).search)).toEqual(open);
  });

  it("keeps the base path of a server behind a proxy", () => {
    const url = tabUrl("https://box.example/nibtree/", {
      folderPaths: [],
      workspaceFile: "C:/w/team.nibtree-workspace",
    });
    expect(url.startsWith("https://box.example/nibtree/?open=")).toBe(true);
    expect(tabOpenFrom(new URL(url).search)).toEqual({ folderPaths: [], workspaceFile: "C:/w/team.nibtree-workspace" });
  });

  it("reads nothing from an address without it, and survives a broken one", () => {
    expect(tabOpenFrom("")).toBeNull();
    expect(tabOpenFrom("?token=abc")).toBeNull();
    expect(tabOpenFrom("?open=not-json")).toBeNull();
    expect(tabOpenFrom(`?open=${encodeURIComponent('{"folderPaths":[1,"/a",""],"workspaceFile":5}')}`)).toEqual({
      folderPaths: ["/a"],
      workspaceFile: null,
    });
  });
});
