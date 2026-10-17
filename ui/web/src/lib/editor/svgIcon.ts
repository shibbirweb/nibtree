// A library icon as an SVG element, for DOM that CodeMirror builds outside Svelte (widgets and gutter markers).
import { icons, type IconName } from "../icons";
import type { IconStroke } from "../logic/presets";
import { scales } from "../styles/tokens";

const SVG_NS = "http://www.w3.org/2000/svg";

/** `size` in pixels from `scales.iconSize`; left out, CSS sizes it. */
export function svgIcon(name: IconName, size: number | null = null, stroke: IconStroke = "bold"): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  if (size !== null) {
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
  }
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(scales.iconStroke[stroke]));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const path of icons[name]) {
    const element = document.createElementNS(SVG_NS, "path");
    element.setAttribute("d", path);
    svg.append(element);
  }
  return svg;
}
