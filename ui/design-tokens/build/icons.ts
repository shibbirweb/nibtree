// The library's icons (ui/web/src/lib/icons.ts) for Swift: GMIcons.swift names them (GMIconName) and maps each to its
// outline, and GMIconPaths*.swift hold the outlines as absolute steps on the 24-point grid (svgPath.ts), so NIcon
// builds a CGPath without parsing SVG.
import { icons } from "../../web/src/lib/icons";
import { chunkBlocks, chunkName } from "./chunks";
import { parsePath, type PathOp } from "./svgPath";
import { SWIFT_HEADER } from "./swift";

const WIDTH = 120;
const KEYWORDS = new Set(["default", "repeat", "case", "import", "return", "func", "class", "struct", "in", "is"]);

/** `chevron-right` as a Swift name: `chevronRight`. */
export function swiftIconName(name: string): string {
  const camel = name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  return KEYWORDS.has(camel) ? `\`${camel}\`` : camel;
}

/** A coordinate to 3 decimals (a thousandth of a grid point is far below a device pixel), no trailing zeros. */
function coordinate(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function opSwift(step: PathOp): string {
  switch (step.op) {
    case "M":
      return `.m(${coordinate(step.x)}, ${coordinate(step.y)})`;
    case "L":
      return `.l(${coordinate(step.x)}, ${coordinate(step.y)})`;
    case "C":
      return `.c(${[step.x1, step.y1, step.x2, step.y2, step.x, step.y].map(coordinate).join(", ")})`;
    case "Z":
      return ".z";
  }
}

/** `static let name: [GMIconOp] = [...]`, wrapped at the line width. */
function iconBlock(name: string, paths: readonly string[]): string[] {
  const steps = paths.flatMap(parsePath).map(opSwift);
  const lines = [`    static let ${swiftIconName(name)}: [GMIconOp] = [`];
  let line = "       ";
  for (const step of steps) {
    const piece = ` ${step},`;
    if (line.length + piece.length > WIDTH) {
      lines.push(line);
      line = "       ";
    }
    line += piece;
  }
  lines.push(line, "    ]");
  return lines;
}

function indexSwift(names: string[]): string {
  return [
    ...SWIFT_HEADER,
    "",
    "/// One step of an icon's outline on its 24-point grid: move, line, cubic curve (handles, then the end), close.",
    "public enum GMIconOp: Sendable {",
    "    case m(CGFloat, CGFloat)",
    "    case l(CGFloat, CGFloat)",
    "    case c(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)",
    "    case z",
    "}",
    "",
    "/// The outlines, one static list per icon (GMIconPaths*.swift), built the first time an icon draws.",
    "enum GMIconPaths {}",
    "",
    "/// Every icon of the library by its ui/web name (`chevron-right` is `.chevronRight`).",
    "public enum GMIconName: String, CaseIterable, Sendable {",
    ...names.map((name) => `    case ${swiftIconName(name)} = "${name}"`),
    "",
    "    /// The icon's outline: all its paths, absolute, arcs as curves.",
    "    public var ops: [GMIconOp] {",
    "        switch self {",
    ...names.map((name) => {
      const swift = swiftIconName(name);
      return `        case .${swift.replace(/`/g, "")}: GMIconPaths.${swift}`;
    }),
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}

export function iconFilesSwift(): { name: string; content: string }[] {
  const names = Object.keys(icons);
  const blocks = Object.entries(icons).map(([name, paths]) => iconBlock(name, paths));
  const chunks = chunkBlocks(blocks, SWIFT_HEADER.length + 3);
  return [
    { name: "GMIcons.swift", content: indexSwift(names) },
    ...chunks.map((chunk, index) => ({
      name: chunkName("GMIconPaths", ".swift", index),
      content: `${[...SWIFT_HEADER, "", "extension GMIconPaths {", ...chunk.flat(), "}"].join("\n")}\n`,
    })),
  ];
}
