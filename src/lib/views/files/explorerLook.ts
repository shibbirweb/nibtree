// How a Files panel row looks: its git tone and status letter (a dot on a folder holding changes), struck through
// when deleted, faded while cut, faint and marked when ignored, the LFS tag, the full path as its tooltip, and a quiet
// highlight while it is the file in the editor.
import type { TreeDecoration } from "@nibtree/ui/logic/treeModel";
import { joinPath } from "$lib/stores/workspacePaths";
import type { RepoStatus } from "$lib/types";
import type { TreeEntry } from "./folderListings";
import { type FileTone, repoTones, type RepoTones, type WorkspaceTones, workspaceTones } from "./tones";

const TONES: Record<FileTone, TreeDecoration["tone"]> = {
  conflict: "danger",
  modified: "accent",
  added: "success",
  deleted: "danger",
};

export interface RowLook {
  changes: Pick<WorkspaceTones, "tone" | "mark">;
  cutPaths: ReadonlySet<string> | null;
  lfsPaths: ReadonlySet<string>;
  openPath: string | null;
}

export function rowDecoration(entry: TreeEntry, look: RowLook): TreeDecoration {
  const tone: FileTone | null = entry.deleted
    ? "deleted"
    : entry.ignored
      ? null
      : (look.changes.tone(entry.path) ?? null);
  const mark = entry.isDir ? null : look.changes.mark(entry.path);
  return {
    tone: tone ? TONES[tone] : undefined,
    strike: entry.deleted,
    badge: mark?.letter,
    badgeTitle: mark ? mark.title : tone ? "Contains changes" : undefined,
    dot: entry.isDir && tone !== null,
    cut: look.cutPaths?.has(entry.path) ?? false,
    ignored: entry.ignored,
    root: entry.isFolderRoot,
    repo: entry.isRepo,
    tag: !entry.isDir && look.lfsPaths.has(entry.path) ? "LFS" : undefined,
    title: entry.path,
    open: entry.path === look.openPath,
  };
}

/** Status tones, marks and deleted files of every repository; an unchanged status is not worked out again. */
export function workspaceChanges(
  repos: readonly { root: string }[],
  statuses: Readonly<Record<string, RepoStatus | undefined>>,
): WorkspaceTones {
  const perRepo: RepoTones[] = [];
  for (const repo of repos) {
    const status = statuses[repo.root];
    if (status) {
      perRepo.push(repoTones(status, repo.root));
    }
  }
  return workspaceTones(perRepo);
}

/** Absolute paths of the files stored in Git LFS, from each repository's LFS status. */
export function lfsPathsOf(statuses: Readonly<Record<string, { files?: string[] | null }>>): Set<string> {
  const paths = new Set<string>();
  for (const [repoRoot, status] of Object.entries(statuses)) {
    for (const filePath of status.files ?? []) {
      paths.add(joinPath(repoRoot, filePath));
    }
  }
  return paths;
}
