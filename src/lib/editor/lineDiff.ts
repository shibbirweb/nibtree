// Line-level Myers diff, fast when the texts are mostly equal (the usual
// case for "what changed in this file"). Used to number selected lines as in
// HEAD, and the change peek's changes; the editor's change marks come from the backend (line_change_marks).

export interface LineHunk {
  /** Half-open line range in the old text. */
  oldStart: number;
  oldEnd: number;
  /** Half-open line range in the new text. */
  newStart: number;
  newEnd: number;
}

/** Past this edit distance the texts are treated as one big change. */
const MAX_EDITS = 4000;

function interned(oldLines: string[], newLines: string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const toIds = (lines: string[]) => {
    const out = new Int32Array(lines.length);
    lines.forEach((line, index) => {
      let id = ids.get(line);
      if (id === undefined) {
        id = ids.size;
        ids.set(line, id);
      }
      out[index] = id;
    });
    return out;
  };
  return [toIds(oldLines), toIds(newLines)];
}

export function diffLines(oldLines: string[], newLines: string[]): LineHunk[] {
  let start = 0;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (start < oldEnd && start < newEnd && oldLines[start] === newLines[start]) {
    start++;
  }
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  if (start === oldEnd && start === newEnd) {
    return [];
  }
  if (start === oldEnd || start === newEnd) {
    return [{ oldStart: start, oldEnd, newStart: start, newEnd }];
  }

  const [a, b] = interned(oldLines.slice(start, oldEnd), newLines.slice(start, newEnd));
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Step d only ever reads diagonals -d..d of the step before, so each snapshot keeps just
  // those 2d+1 values (indexed by k + d), not the whole array: memory follows the edits made.
  const trace: Int32Array[] = [];
  let found = false;

  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) {
    return [{ oldStart: start, oldEnd, newStart: start, newEnd }];
  }

  // Walk the trace backwards to recover the edit path as matched pairs.
  const matches: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const previous = trace[d];
    // The snapshot taken before step d, indexed by k + d.
    const at = (diagonal: number) => previous[diagonal + d];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      matches.push([x, y]);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    matches.push([x, y]);
  }
  matches.reverse();

  const hunks: LineHunk[] = [];
  let oldPos = 0;
  let newPos = 0;
  const flush = (oldTo: number, newTo: number) => {
    if (oldPos < oldTo || newPos < newTo) {
      hunks.push({ oldStart: start + oldPos, oldEnd: start + oldTo, newStart: start + newPos, newEnd: start + newTo });
    }
  };
  for (const [matchOld, matchNew] of matches) {
    flush(matchOld, matchNew);
    oldPos = matchOld + 1;
    newPos = matchNew + 1;
  }
  flush(n, m);
  return hunks;
}

export type ChangeMarkKind = "added" | "modified" | "deleted" | "conflict";

export interface ChangeMark {
  /** Half-open line range in the displayed document; empty for deletions. */
  from: number;
  to: number;
  kind: ChangeMarkKind;
}
