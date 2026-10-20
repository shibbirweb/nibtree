// The top bar's worktree switcher (WorktreeSwitcher.svelte): a row per worktree with what it tracks, and what
// picking one does. Paths are absolute, as the backend lists them.
import type { OpKind, WorktreeSummary } from "$lib/types";
import { sortedWorktrees, worktreeLabel } from "./worktreeModel";

export interface SwitcherRow {
  path: string;
  /** The branch, or "detached at" a commit. */
  label: string;
  /** The worktree's folder name. */
  folder: string;
  current: boolean;
  isMain: boolean;
  /** A merge, rebase or the like stopped in it, as a word; null when none is. */
  busy: string | null;
  conflicts: number;
  changes: number;
  ahead: number;
  behind: number;
  lastActivity: number | null;
  /** Why it cannot be opened (its folder is gone, or it is bare); null when it can. */
  unavailable: string | null;
}

const BUSY: Record<OpKind, string | null> = {
  none: null,
  merge: "Merging",
  rebase: "Rebasing",
  cherryPick: "Cherry-picking",
  revert: "Reverting",
  other: "In progress",
};

function folderName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

export function switcherRows(summaries: readonly WorktreeSummary[]): SwitcherRow[] {
  const byPath = new Map(summaries.map((summary) => [summary.path, summary]));
  return sortedWorktrees([...summaries]).map((info) => {
    const summary = byPath.get(info.path) ?? (info as WorktreeSummary);
    return {
      path: summary.path,
      label: worktreeLabel(summary),
      folder: folderName(summary.path),
      current: summary.isCurrent,
      isMain: summary.isMain,
      busy: BUSY[summary.op] ?? null,
      conflicts: summary.conflicts,
      changes: summary.changes,
      ahead: summary.ahead,
      behind: summary.behind,
      lastActivity: summary.lastActivity,
      unavailable: summary.prunable ? "Its folder is gone" : summary.bare ? "A bare repository has no files" : null,
    };
  });
}

/** "3 changes", "1 change", or null for none. */
export function changesText(changes: number): string | null {
  if (changes === 0) {
    return null;
  }
  return changes === 1 ? "1 change" : `${changes} changes`;
}

/**
 * What picking a row does: nothing for the worktree on screen, make it the active repository when it is already
 * open in the workspace (`openRoots`), else add its folder to the workspace first. Nothing that runs is closed.
 */
export function switchAction(row: SwitcherRow, openRoots: readonly string[]): "none" | "activate" | "join" {
  if (row.current || row.unavailable) {
    return "none";
  }
  const path = row.path.replace(/\/+$/, "");
  return openRoots.some((root) => root.replace(/\/+$/, "") === path) ? "activate" : "join";
}
