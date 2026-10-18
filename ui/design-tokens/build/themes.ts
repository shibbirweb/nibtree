// The color themes for the native macOS app: every theme's tokens computed by the UI library's catalog, the same code
// the web app runs, so a theme looks the same on every platform. GMThemes.swift lists the themes and finds one's
// colors; GMThemeColors*.swift hold the colors, a few themes per file.
import { catalogThemeIds, themeColors } from "../../web/src/lib/themes/catalog";
import { COLOR_TOKENS } from "../../web/src/lib/themes/colorTokens";
import { THEME_INDEX } from "../../web/src/lib/themes/themeIndex";
import { chunkBlocks, chunkName } from "./chunks";
import { parseTokenColor } from "./color";
import { camelName } from "./model";
import { SWIFT_HEADER } from "./swift";

const WIDTH = 120;
const INDENT = "            ";

/** `"panelAlt": GMRGBA(242, 243, 245, 1)` pairs packed into lines of at most WIDTH columns. */
function packed(items: string[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const next = line ? `${line} ${item}` : item;
    if (line && INDENT.length + next.length > WIDTH) {
      lines.push(`${INDENT}${line}`);
      line = item;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(`${INDENT}${line}`);
  }
  return lines;
}

/** One theme's colors as a function on GMTheme. The shadow is not a color: GMShadows.popup in the theme's mode. */
function themeBlock(themeId: string): string[] {
  const colors = themeColors(themeId);
  if (!colors) {
    throw new Error(`No colors for theme ${themeId}`);
  }
  const pairs = Object.entries(colors)
    .filter(([token]) => token !== "--shadow")
    .map(([token, value]) => {
      const color = parseTokenColor(value);
      return `"${camelName(token.slice(2))}": GMRGBA(${color.red}, ${color.green}, ${color.blue}, ${color.alpha}),`;
    });
  return [
    "",
    "extension GMTheme {",
    `    static func ${camelName(themeId)}() -> [String: GMRGBA] {`,
    "        [",
    ...packed(pairs),
    "        ]",
    "    }",
    "}",
  ];
}

/** `case bg, frame, panel, ...` lines for GMColorToken, packed like the colors. */
function colorTokenCases(): string[] {
  const names = COLOR_TOKENS.filter((token) => token !== "--shadow").map((token) => camelName(token.slice(2)));
  const lines: string[] = [];
  let line = "";
  for (const name of names) {
    const next = line ? `${line}, ${name}` : name;
    if (line && `    case ${next}`.length > WIDTH) {
      lines.push(`    case ${line}`);
      line = name;
    } else {
      line = next;
    }
  }
  lines.push(`    case ${line}`);
  return lines;
}

/** GMThemes.swift: the theme list in picker order and the lookup of a theme's colors. */
function themesSwift(): string {
  const ids = catalogThemeIds();
  const lines = [
    ...SWIFT_HEADER,
    "",
    "/** A color theme: its id (the settings value), name and kind (light, dark, high-contrast-light or -dark). */",
    "public struct GMThemeInfo: Sendable {",
    "    public let id: String, name: String, kind: String",
    "}",
    "",
    "/** Every color a theme sets, named like GMColor; the raw value is its key in GMTheme.colors(_:). */",
    "public enum GMColorToken: String, CaseIterable, Sendable {",
    ...colorTokenCases(),
    "}",
    "",
    "public enum GMTheme {",
    "    /** Every theme in picker order. */",
    "    public static let all: [GMThemeInfo] = [",
    ...THEME_INDEX.map(
      (theme) => `        GMThemeInfo(id: "${theme.id}", name: "${theme.name}", kind: "${theme.kind}"),`,
    ),
    "    ]",
    "",
    "    /** Every color of a theme, named like GMColor (panelAlt is --panel-alt); nil for an unknown id. */",
    "    public static func colors(_ themeId: String) -> [String: GMRGBA]? {",
    "        switch themeId {",
    ...ids.map((themeId) => `        case "${themeId}": return ${camelName(themeId)}()`),
    "        default: return nil",
    "        }",
    "    }",
    "}",
  ];
  return `${lines.join("\n")}\n`;
}

export interface ThemeFile {
  name: string;
  content: string;
}

/** GMThemes.swift and the GMThemeColors*.swift files, each within the line limit. */
export function themeFilesSwift(): ThemeFile[] {
  const blocks = catalogThemeIds().map(themeBlock);
  const colorFiles = chunkBlocks(blocks, SWIFT_HEADER.length + 1).map((chunk, index) => ({
    name: chunkName("GMThemeColors", ".swift", index),
    content: `${[...SWIFT_HEADER, ...chunk.flat()].join("\n")}\n`,
  }));
  return [{ name: "GMThemes.swift", content: themesSwift() }, ...colorFiles];
}
