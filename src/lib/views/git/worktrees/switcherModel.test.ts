import { describe, expect, it } from "vitest";
import type { WorktreeSummary } from "$lib/types";
import { changesText, switchAction, switcherRows } from "./switcherModel";

function summary(path: string, extra: Partial<WorktreeSummary> = {}): WorktreeSummary {
  return {
    path,
    head: "0123456789abcdef",
    branch: null,
    detached: false,
    bare: false,
    locked: false,
    lockReason: null,
    prunable: false,
    prunableReason: null,
    isMain: false,
    isCurrent: false,
    changes: 0,
    conflicts: 0,
    upstream: null,
    ahead: 0,
    behind: 0,
    op: "none",
    lastActivity: null,
    ...extra,
  };
}

describe("switcherRows", () => {
  const rows = switcherRows([
    summary("/w/shop-login", { branch: "feat/login", changes: 3, ahead: 1, behind: 2, lastActivity: 5 }),
    summary("/w/shop", { branch: "main", isMain: true, isCurrent: true }),
    summary("/w/shop-fix/", { detached: true, op: "merge", conflicts: 2 }),
    summary("/w/shop-gone", { branch: "old", prunable: true }),
  ]);

  it("puts the main worktree first and names each by branch and folder", () => {
    expect(rows.map((row) => [row.label, row.folder])).toEqual([
      ["main", "shop"],
      ["detached at 01234567", "shop-fix"],
      ["old", "shop-gone"],
      ["feat/login", "shop-login"],
    ]);
  });

  it("tracks changes, ahead and behind, a stopped merge and the last activity", () => {
    const login = rows.find((row) => row.label === "feat/login");
    expect(login).toMatchObject({ changes: 3, ahead: 1, behind: 2, lastActivity: 5, busy: null });
    expect(rows[1]).toMatchObject({ busy: "Merging", conflicts: 2 });
    expect(rows[2].unavailable).toBe("Its folder is gone");
  });

  it("joins, activates or leaves each row", () => {
    const openRoots = ["/w/shop", "/w/shop-fix"];
    expect(rows.map((row) => switchAction(row, openRoots))).toEqual(["none", "activate", "none", "join"]);
  });
});

describe("changesText", () => {
  it("counts changes", () => {
    expect(changesText(0)).toBeNull();
    expect(changesText(1)).toBe("1 change");
    expect(changesText(4)).toBe("4 changes");
  });
});
