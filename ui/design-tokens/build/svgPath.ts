// Turns an SVG path's `d` into absolute moves, lines, cubic curves and closes, the four steps every platform draws
// natively (Core Graphics, XAML, Cairo). Arcs become cubic curves here, once, so no app parses SVG while it draws.

export type PathOp =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

const COMMANDS = "MmLlHhVvCcSsAaZz";

/** Reads numbers and arc flags from a `d` string, which may run numbers together (`1.5.5`, `2-2`, `011`). */
class Scanner {
  private index = 0;

  constructor(private readonly text: string) {}

  private skip() {
    while (this.index < this.text.length && /[\s,]/.test(this.text[this.index])) {
      this.index += 1;
    }
  }

  /** The next command letter, or null when a number follows (a repeated command). */
  command(): string | null {
    this.skip();
    const char = this.text[this.index];
    if (char !== undefined && COMMANDS.includes(char)) {
      this.index += 1;
      return char;
    }
    if (char !== undefined && /[A-Za-z]/.test(char)) {
      throw new Error(`Unsupported SVG path command "${char}"`);
    }
    return null;
  }

  done(): boolean {
    this.skip();
    return this.index >= this.text.length;
  }

  number(): number {
    this.skip();
    const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.text.slice(this.index));
    if (!match) {
      throw new Error(`Expected a number at ${this.index} in "${this.text}"`);
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  /** An arc flag: one character, 0 or 1, never more (`011` is three flags or a flag and a number). */
  flag(): boolean {
    this.skip();
    const char = this.text[this.index];
    if (char !== "0" && char !== "1") {
      throw new Error(`Expected an arc flag at ${this.index} in "${this.text}"`);
    }
    this.index += 1;
    return char === "1";
  }
}

/** The signed angle from vector u to vector v. */
function angle(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/** An SVG arc (endpoint form, SVG 1.1 F.6.5) as cubic curves of at most a quarter turn each. */
export function arcToCurves(
  from: { x: number; y: number },
  arc: { rx: number; ry: number; rotation: number; large: boolean; sweep: boolean; x: number; y: number },
): PathOp[] {
  if (from.x === arc.x && from.y === arc.y) {
    return [];
  }
  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  if (rx === 0 || ry === 0) {
    return [{ op: "L", x: arc.x, y: arc.y }];
  }
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - arc.x) / 2;
  const dy = (from.y - arc.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Radii too small to reach the end grow just enough (the spec's correction).
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coefficient = (arc.large === arc.sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxPrime = (coefficient * rx * y1) / ry;
  const cyPrime = (-coefficient * ry * x1) / rx;
  const cx = cos * cxPrime - sin * cyPrime + (from.x + arc.x) / 2;
  const cy = sin * cxPrime + cos * cyPrime + (from.y + arc.y) / 2;
  const start = angle(1, 0, (x1 - cxPrime) / rx, (y1 - cyPrime) / ry);
  let turn = angle((x1 - cxPrime) / rx, (y1 - cyPrime) / ry, (-x1 - cxPrime) / rx, (-y1 - cyPrime) / ry);
  if (!arc.sweep && turn > 0) {
    turn -= 2 * Math.PI;
  } else if (arc.sweep && turn < 0) {
    turn += 2 * Math.PI;
  }
  const segments = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 2) - 1e-9));
  const step = turn / segments;
  const handle = (4 / 3) * Math.tan(step / 4);
  const point = (ux: number, uy: number) => ({
    x: cx + cos * rx * ux - sin * ry * uy,
    y: cy + sin * rx * ux + cos * ry * uy,
  });
  const curves: PathOp[] = [];
  for (let index = 0; index < segments; index += 1) {
    const a1 = start + index * step;
    const a2 = a1 + step;
    const c1 = point(Math.cos(a1) - handle * Math.sin(a1), Math.sin(a1) + handle * Math.cos(a1));
    const c2 = point(Math.cos(a2) + handle * Math.sin(a2), Math.sin(a2) - handle * Math.cos(a2));
    const end = index === segments - 1 ? { x: arc.x, y: arc.y } : point(Math.cos(a2), Math.sin(a2));
    curves.push({ op: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });
  }
  return curves;
}

/** Every step of `d`, absolute: H and V become lines, S a full curve, arcs curves. */
export function parsePath(d: string): PathOp[] {
  const scan = new Scanner(d);
  const ops: PathOp[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // The last curve's second handle, for S; null after anything that is not a curve.
  let handle: { x: number; y: number } | null = null;
  let command: string | null = null;
  while (!scan.done()) {
    const next = scan.command();
    if (next !== null) {
      command = next;
    } else if (command === null || command === "Z" || command === "z") {
      throw new Error(`Path must start with a command: "${d}"`);
    }
    const name = command as string;
    const relative = name === name.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    let curveHandle: { x: number; y: number } | null = null;
    switch (name.toUpperCase()) {
      case "M":
        x = ox + scan.number();
        y = oy + scan.number();
        startX = x;
        startY = y;
        ops.push({ op: "M", x, y });
        // Numbers after a move are lines (SVG's implicit command).
        command = relative ? "l" : "L";
        break;
      case "L":
        x = ox + scan.number();
        y = oy + scan.number();
        ops.push({ op: "L", x, y });
        break;
      case "H":
        x = ox + scan.number();
        ops.push({ op: "L", x, y });
        break;
      case "V":
        y = oy + scan.number();
        ops.push({ op: "L", x, y });
        break;
      case "C":
      case "S": {
        const first =
          name.toUpperCase() === "C"
            ? { x: ox + scan.number(), y: oy + scan.number() }
            : { x: 2 * x - (handle?.x ?? x), y: 2 * y - (handle?.y ?? y) };
        const second = { x: ox + scan.number(), y: oy + scan.number() };
        x = ox + scan.number();
        y = oy + scan.number();
        ops.push({ op: "C", x1: first.x, y1: first.y, x2: second.x, y2: second.y, x, y });
        curveHandle = second;
        break;
      }
      case "A": {
        const rx = scan.number();
        const ry = scan.number();
        const rotation = scan.number();
        const large = scan.flag();
        const sweep = scan.flag();
        const end = { x: ox + scan.number(), y: oy + scan.number() };
        ops.push(...arcToCurves({ x, y }, { rx, ry, rotation, large, sweep, ...end }));
        x = end.x;
        y = end.y;
        break;
      }
      default:
        ops.push({ op: "Z" });
        x = startX;
        y = startY;
        command = null;
    }
    handle = curveHandle;
  }
  return ops;
}
