// How alike two pictures are and whether a component passes: the pure part of the parity check.

/** The share of pixels that must match for a component to pass. */
export const MIN_MATCH = 0.99;

/** A pixel matches when no channel differs by more than this (0-255): sub-pixel text edges, not visible changes. */
export const CHANNEL_TOLERANCE = 24;

export interface Picture {
  width: number;
  height: number;
  /** RGBA bytes, row by row. */
  data: Uint8ClampedArray | number[];
}

export interface Match {
  /** Share of pixels that match the other picture at the same spot or one device pixel away (half a point at 2x),
   *  within the tolerance. A glyph drawn half a pixel apart is not a visible difference; a wrong color,
   *  size or weight, or a shift of a point, is. 0 when the sizes differ. */
  ratio: number;
  /** Share of pixels within the tolerance at exactly the same spot. */
  strict: number;
  /** Share of pixels that are exactly equal. */
  exact: number;
  sameSize: boolean;
}

function worstChannel(a: Picture, i: number, b: Picture, j: number): number {
  let worst = 0;
  for (let channel = 0; channel < 4; channel += 1) {
    worst = Math.max(worst, Math.abs(a.data[i + channel] - b.data[j + channel]));
  }
  return worst;
}

/** Whether pixel (x, y) of `a` is within the tolerance of `b` at the same spot or a neighbouring one. */
function nearMatch(a: Picture, b: Picture, x: number, y: number, tolerance: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < b.width && ny < b.height) {
        if (worstChannel(a, (y * a.width + x) * 4, b, (ny * b.width + nx) * 4) <= tolerance) {
          return true;
        }
      }
    }
  }
  return false;
}

export function compare(a: Picture, b: Picture, tolerance = CHANNEL_TOLERANCE): Match {
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 0, strict: 0, exact: 0, sameSize: false };
  }
  const pixels = a.width * a.height;
  let near = 0;
  let close = 0;
  let equal = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const index = (y * a.width + x) * 4;
      const worst = worstChannel(a, index, b, index);
      if (worst === 0) {
        equal += 1;
      }
      if (worst <= tolerance) {
        close += 1;
        near += 1;
      } else if (nearMatch(a, b, x, y, tolerance) && nearMatch(b, a, x, y, tolerance)) {
        near += 1;
      }
    }
  }
  return pixels
    ? { ratio: near / pixels, strict: close / pixels, exact: equal / pixels, sameSize: true }
    : { ratio: 1, strict: 1, exact: 1, sameSize: true };
}

export interface Verdict {
  id: string;
  /** Lowest match of its light and dark pictures. */
  match: number;
  /** Lowest same-spot match. */
  strict: number;
  webMs: number;
  swiftMs: number;
  problems: string[];
}

/** A scenario passes with at least MIN_MATCH in both appearances, near and at the same spot, and a Swift render
 *  faster than the web one. A run of one check (`--match` or `--speed`) passes no pictures or no times, and the
 *  other check is left out (its numbers are NaN). */
export function verdict(id: string, matches: Match[], webMs?: number, swiftMs?: number): Verdict {
  const problems: string[] = [];
  if (matches.some((match) => !match.sameSize)) {
    problems.push("different size from the web component");
  }
  const match = matches.length ? Math.min(...matches.map((one) => one.ratio)) : Number.NaN;
  if (match < MIN_MATCH) {
    problems.push(`matches ${(match * 100).toFixed(2)}%, needs ${MIN_MATCH * 100}%`);
  }
  const strict = matches.length ? Math.min(...matches.map((one) => one.strict)) : Number.NaN;
  if (strict < MIN_MATCH) {
    problems.push(`matches ${(strict * 100).toFixed(2)}% at the same spot, needs ${MIN_MATCH * 100}%`);
  }
  const timed = webMs !== undefined || swiftMs !== undefined;
  const [web, swift] = [webMs ?? Number.NaN, swiftMs ?? Number.NaN];
  if (timed && !(swift < web)) {
    problems.push(`Swift ${swift.toFixed(1)} ms is not faster than web ${web.toFixed(1)} ms`);
  }
  return { id, match, strict, webMs: web, swiftMs: swift, problems };
}

/** The fastest run: what the component costs once caches and the JIT are warm, without the machine's noise. */
export function best(values: number[]): number {
  return values.length ? Math.min(...values) : Number.NaN;
}
