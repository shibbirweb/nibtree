import { describe, expect, it } from "vitest";

import type { BrowseEntry } from "$lib/types";
import { chosenPath, matchesFilters, pickRequest, pickStart, saveName, shownEntries } from "./pathPickerModel";

const WORKSPACE = [{ name: "Workspace", extensions: ["nibtree-workspace", "code-workspace"] }];

function entry(name: string, isDir: boolean): BrowseEntry {
  return { name, isDir, hidden: name.startsWith(".") };
}

describe("path picker model", () => {
  it("reads the dialog plugin's options", () => {
    expect(pickRequest("open", { directory: true, multiple: false, title: "Open Folder" })).toEqual({
      mode: "folder",
      title: "Open Folder",
      defaultPath: null,
      filters: [],
      multiple: false,
    });
    const file = pickRequest("open", { filters: WORKSPACE, defaultPath: "/Users/me" });
    expect(file).toMatchObject({ mode: "file", title: "Choose a File", defaultPath: "/Users/me", filters: WORKSPACE });
    expect(pickRequest("save", undefined)).toMatchObject({ mode: "save", title: "Save", filters: [] });
    expect(pickRequest("open", { filters: [{ name: 3, extensions: ["x", 4] }] }).filters).toEqual([
      { name: "", extensions: ["x"] },
    ]);
  });

  it("starts Save in the default path's folder with its name, Open in the path itself", () => {
    const save = pickRequest("save", { defaultPath: "/Users/me/code/app.nibtree-workspace" });
    expect(pickStart(save)).toEqual({ folderPath: "/Users/me/code", name: "app.nibtree-workspace" });
    expect(pickStart(pickRequest("save", { defaultPath: "/top.patch" }))).toEqual({
      folderPath: "/",
      name: "top.patch",
    });
    expect(pickStart(pickRequest("save", { defaultPath: "fix.patch" }))).toEqual({
      folderPath: null,
      name: "fix.patch",
    });
    expect(pickStart(pickRequest("open", { defaultPath: "/Users/me/repo" }))).toEqual({
      folderPath: "/Users/me/repo",
      name: "",
    });
    expect(pickStart(pickRequest("open", {}))).toEqual({ folderPath: null, name: "" });
  });

  it("shows folders, and only the files the filters take", () => {
    const entries = [
      entry(".git", true),
      entry("src", true),
      entry("team.code-workspace", false),
      entry("a.ts", false),
    ];
    const names = (request: ReturnType<typeof pickRequest>, hidden = false) =>
      shownEntries(entries, request, hidden).map((shown) => shown.name);
    expect(names(pickRequest("open", { directory: true }))).toEqual(["src"]);
    expect(names(pickRequest("open", { directory: true }), true)).toEqual([".git", "src"]);
    expect(names(pickRequest("open", { filters: WORKSPACE }))).toEqual(["src", "team.code-workspace"]);
    expect(names(pickRequest("open", {}))).toEqual(["src", "team.code-workspace", "a.ts"]);
    expect(matchesFilters("A.PATCH", [{ name: "Patch", extensions: ["patch"] }])).toBe(true);
    expect(matchesFilters("x.diff", [{ name: "All", extensions: ["*"] }])).toBe(true);
  });

  it("adds the first extension to a Save name without one", () => {
    expect(saveName("team", WORKSPACE)).toBe("team.nibtree-workspace");
    expect(saveName(" team.code-workspace ", WORKSPACE)).toBe("team.code-workspace");
    expect(saveName("notes", [])).toBe("notes");
    expect(saveName("", WORKSPACE)).toBe("");
  });

  it("chooses the selected entry, or the folder itself", () => {
    expect(chosenPath("/Users/me", "code")).toBe("/Users/me/code");
    expect(chosenPath("/", "tmp")).toBe("/tmp");
    expect(chosenPath("C:/Users", null)).toBe("C:/Users");
  });
});
