// The change peek's pure parts: the editor text's changes against the index, where the peek sits, its counter,
// and the index text that stages one change. Lines are 0-based; a text ending in a line break has an empty last line.
import { diffLines, type LineHunk } from "$lib/editor/lineDiff";
import { changeAtLine } from "$lib/editor/revertLines";

export type PeekKind = "added" | "modified" | "deleted";

/** The changes of `docText` against `baseText`, top down. */
export function peekChanges(baseText: string, docText: string): LineHunk[] {
  return diffLines(baseText.split("\n"), docText.split("\n"));
}

export function hunkKind(hunk: LineHunk): PeekKind {
  if (hunk.oldEnd === hunk.oldStart) {
    return "added";
  }
  return hunk.newEnd === hunk.newStart ? "deleted" : "modified";
}

/** The change on `line` (or the deletion just above it), -1 for none. */
export function changeIndexAt(hunks: readonly LineHunk[], line: number, docLines: number): number {
  const hunk = changeAtLine(hunks, line, docLines);
  return hunk ? hunks.indexOf(hunk) : -1;
}

/** The line the peek opens under: a change's last line, or the line above a deletion (the first line at the top). */
export function peekLine(hunk: LineHunk, docLines: number): number {
  const line = hunk.newEnd > hunk.newStart ? hunk.newEnd - 1 : hunk.newStart - 1;
  return Math.max(0, Math.min(line, docLines - 1));
}

/** "2 of 4 changes". */
export function peekCounter(index: number, count: number): string {
  return `${index + 1} of ${count} ${count === 1 ? "change" : "changes"}`;
}

/** The change after (`1`) or before (`-1`) `index`, wrapping around. */
export function stepIndex(index: number, count: number, direction: 1 | -1): number {
  return (index + direction + count) % count;
}

/** The index text with the editor's lines of change `hunk` in it: what staging that one change writes. */
export function stagedText(baseText: string, docText: string, hunk: LineHunk): string {
  const base = baseText.split("\n");
  const doc = docText.split("\n");
  return [...base.slice(0, hunk.oldStart), ...doc.slice(hunk.newStart, hunk.newEnd), ...base.slice(hunk.oldEnd)].join(
    "\n",
  );
}

/** The changes as the diff view's hunks, so the peek's diff shows exactly these changes. */
export function viewHunks(hunks: readonly LineHunk[]): [number, number, number, number][] {
  return hunks.map((hunk) => [hunk.oldStart, hunk.oldEnd, hunk.newStart, hunk.newEnd]);
}
