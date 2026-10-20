// A file editor's git marks: changed lines against the index in the gutter and ruler, the change peek a bar opens
// (changePeek/), and blame. Each runs only when what it was made for changed (the text, the index's version of
// the file, or HEAD), so a refresh of an unchanged tab costs one small call.
import type { EditorState, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { api } from "$lib/api";
import { loadBlame } from "$lib/editor/blame";
import { conflictField } from "$lib/editor/conflictDecorations";
import { type ChangeMark, diffLines } from "$lib/editor/lineDiff";
import { changeMarkField, type MarkSource, setChangeMarks } from "$lib/editor/scrollMarkers";
import type { RepoLocation } from "$lib/stores/workspacePaths";
import type { Eol, HeadVersion, RepoStatus } from "$lib/types";
import { FilePeek } from "./changePeek/filePeek";

export interface GitInfoHost {
  filePath: string;
  view: () => EditorView | null;
  location: () => RepoLocation | null;
  repoStatus: () => RepoStatus | null;
  /** The file's line endings, for blaming unsaved text. */
  eol: () => Eol | null;
}

export class FileGitInfo {
  /** The base version (index and HEAD) as last seen, and the text and versions the marks and blame were made for. */
  #head: HeadVersion | null = null;
  #marksFor: { doc: Text; blobId: string | null } | null = null;
  #blameFor: { doc: Text; commitId: string | null } | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  readonly peek: FilePeek;

  constructor(private readonly host: GitInfoHost) {
    this.peek = new FilePeek({
      view: host.view,
      location: host.location,
      eol: host.eol,
      origPath: (repoPath) => this.origPath(repoPath),
      refreshMarks: () => this.refresh(),
    });
  }

  /** The path HEAD has the file under: the old one for a staged rename. */
  origPath(repoPath: string): string | null {
    return this.host.repoStatus()?.files.find((entry) => entry.path === repoPath)?.origPath ?? null;
  }

  /** Brings the change marks and blame up to date with the text and HEAD. */
  async refresh(): Promise<void> {
    const owner = this.host.location();
    const shown = this.host.view();
    if (!owner || !shown) {
      void this.updateMarks();
      return;
    }
    let head: HeadVersion;
    try {
      head = await api.baseFileVersion(owner.repo.root, owner.repoPath, this.origPath(owner.repoPath));
    } catch {
      return;
    }
    if (this.host.view() !== shown) {
      return;
    }
    this.#head = head;
    const doc = shown.state.doc;
    if (this.#marksFor?.doc !== doc || this.#marksFor.blobId !== head.blobId) {
      void this.updateMarks();
    }
    if (this.#blameFor?.doc !== doc || this.#blameFor.commitId !== head.commitId) {
      this.refreshBlame();
    }
  }

  /** Blames the text on screen; unsaved edits show as uncommitted. */
  refreshBlame(): void {
    const owner = this.host.location();
    const view = this.host.view();
    const eol = this.host.eol();
    if (!view || eol === null || !owner) {
      return;
    }
    const filePath = this.host.filePath;
    this.#blameFor = { doc: view.state.doc, commitId: this.#head?.commitId ?? null };
    void loadBlame(
      view,
      { repoRoot: owner.repo.root, filePath: owner.repoPath, revision: null, origin: (line) => ({ filePath, line }) },
      eol,
    );
  }

  /** Changed lines against HEAD, computed by the backend; results for text edited since are dropped. */
  async updateMarks(): Promise<void> {
    const owner = this.host.location();
    const shown = this.host.view();
    if (!shown) {
      return;
    }
    const doc = shown.state.doc;
    if (!owner) {
      this.#marksFor = null;
      if (shown.state.field(changeMarkField).length > 0) {
        shown.dispatch({ effects: setChangeMarks.of([]) });
      }
      return;
    }
    const blobId = this.#head?.blobId ?? null;
    if (this.#marksFor?.doc === doc && this.#marksFor.blobId === blobId) {
      return;
    }
    this.#marksFor = { doc, blobId };
    let marks: ChangeMark[] = [];
    try {
      const result = await api.lineChangeMarks(
        owner.repo.root,
        owner.repoPath,
        this.origPath(owner.repoPath),
        doc.toString(),
      );
      marks = result.marks;
      if (this.host.view() === shown && shown.state.doc === doc) {
        this.#marksFor = { doc, blobId: result.base.blobId };
      }
    } catch {
      // No marks, e.g. while the repository is being changed; the next refresh tries again.
      this.#marksFor = null;
    }
    // A newer edit schedules its own run.
    if (this.host.view() !== shown || shown.state.doc !== doc) {
      return;
    }
    shown.dispatch({ effects: setChangeMarks.of(marks) });
  }

  /** After a pause in typing. */
  scheduleMarks(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.updateMarks(), 200);
  }

  dispose(): void {
    clearTimeout(this.#timer);
  }
}

/** The marks the gutter and ruler draw: conflict regions win over plain changes. Memoized per editor. */
export function conflictAwareMarks(): MarkSource {
  let memo: { changes: readonly ChangeMark[]; conflicts: unknown; result: ChangeMark[] } | null = null;
  return (state: EditorState) => {
    const changes = state.field(changeMarkField, false) ?? [];
    const conflicts = state.field(conflictField, false) ?? [];
    if (memo && memo.changes === changes && memo.conflicts === conflicts) {
      return memo.result;
    }
    const conflictMarks: ChangeMark[] = conflicts.map((region) => ({
      from: region.start,
      to: region.end + 1,
      kind: "conflict",
    }));
    const outside = changes.filter(
      (mark) =>
        !conflictMarks.some((conflict) => mark.from < conflict.to && Math.max(mark.to, mark.from + 1) > conflict.from),
    );
    const result = [...outside, ...conflictMarks].sort((a, b) => a.from - b.from);
    memo = { changes, conflicts, result };
    return result;
  };
}
