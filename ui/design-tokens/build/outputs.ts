// Every generated file and its content, for scripts/tokens.ts (write or --check) and tokens.test.ts. Component
// output is split into numbered files (chunks.ts) so each stays within the line limit.
import { chunkBlocks, chunkName } from "./chunks";
import { colorsCss, componentBlocksCss, componentsSheet, scalesCss, tokensCss, typographyCss } from "./css";
import { colorsGtk, metricsGtk, typographyGtk } from "./gtk";
import { iconFilesSwift } from "./icons";
import { designTokens, type Tokens } from "./model";
import { colorsSwift, componentBlocksSwift, metricsSwift, SWIFT_HEADER, typographySwift } from "./swift";
import { themeFilesSwift } from "./themes";
import { tokensTs } from "./ts";
import { colorsXaml, componentBlocksXaml, metricsXaml, typographyXaml, XAML_OPEN } from "./xaml";

export interface Output {
  /** Path from ui/. */
  path: string;
  content: string;
}

function componentFiles(tokens: Tokens) {
  const css = chunkBlocks(componentBlocksCss(tokens), 4).map((blocks, index) => ({
    name: chunkName("components", ".css", index),
    content: componentsSheet(blocks),
  }));
  const swift = chunkBlocks(componentBlocksSwift(tokens), SWIFT_HEADER.length + 1).map((blocks, index) => ({
    name: chunkName("GMComponents", ".swift", index),
    content: `${[...SWIFT_HEADER, ...blocks.flat()].join("\n")}\n`,
  }));
  const xaml = chunkBlocks(componentBlocksXaml(tokens), XAML_OPEN.length + 2).map((blocks, index) => ({
    name: chunkName("Components", ".xaml", index),
    content: [...XAML_OPEN, ...blocks.flat(), "</ResourceDictionary>", ""].join("\n"),
  }));
  return { css, swift, xaml };
}

export function tokenOutputs(tokens: Tokens = designTokens): Output[] {
  const components = componentFiles(tokens);
  return [
    { path: "web/src/lib/styles/tokens.css", content: tokensCss(components.css.map((file) => file.name)) },
    { path: "web/src/lib/styles/scales.css", content: scalesCss(tokens) },
    { path: "web/src/lib/styles/typography.css", content: typographyCss(tokens) },
    ...components.css.map((file) => ({ path: `web/src/lib/styles/${file.name}`, content: file.content })),
    ...tokensTs(tokens).map((file) => ({ path: `web/src/lib/styles/${file.name}`, content: file.content })),
    { path: "web/src/lib/styles/colors.css", content: colorsCss(tokens) },
    { path: "swift/Sources/NibtreeTokens/GMColors.swift", content: colorsSwift(tokens) },
    { path: "swift/Sources/NibtreeTokens/GMMetrics.swift", content: metricsSwift(tokens) },
    { path: "swift/Sources/NibtreeTokens/GMTypography.swift", content: typographySwift(tokens) },
    ...components.swift.map((file) => ({ path: `swift/Sources/NibtreeTokens/${file.name}`, content: file.content })),
    ...themeFilesSwift().map((file) => ({ path: `swift/Sources/NibtreeTokens/${file.name}`, content: file.content })),
    ...iconFilesSwift().map((file) => ({ path: `swift/Sources/NibtreeTokens/${file.name}`, content: file.content })),
    { path: "design-tokens/generated/windows/Colors.xaml", content: colorsXaml(tokens) },
    { path: "design-tokens/generated/windows/Metrics.xaml", content: metricsXaml(tokens) },
    { path: "design-tokens/generated/windows/Typography.xaml", content: typographyXaml(tokens) },
    ...components.xaml.map((file) => ({ path: `design-tokens/generated/windows/${file.name}`, content: file.content })),
    { path: "design-tokens/generated/linux/colors-light.css", content: colorsGtk(tokens, "light") },
    { path: "design-tokens/generated/linux/colors-dark.css", content: colorsGtk(tokens, "dark") },
    { path: "design-tokens/generated/linux/metrics.css", content: metricsGtk(tokens) },
    { path: "design-tokens/generated/linux/typography.css", content: typographyGtk(tokens) },
    ...components.css.map((file) => ({ path: `design-tokens/generated/linux/${file.name}`, content: file.content })),
  ];
}
