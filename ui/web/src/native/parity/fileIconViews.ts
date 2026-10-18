// The app's file icon sets for parity scenarios. They live in static/file-icons: a scenario names a Material icon
// (`{ kind: "image", icon }`) or a Minimal glyph and tone (`{ kind: "mask", glyph, tone }`), and this turns it into
// the view the app's resolver would pass.
import type { FileIconView } from "../../lib/components/FileIcon.svelte";
import "../../../../../static/file-icons/minimal/minimal.css";

const MATERIAL = "../../../../../static/file-icons/material/";
const material = import.meta.glob<string>("../../../../../static/file-icons/material/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export function fileIconView(asked: Record<string, string> | null | undefined): FileIconView {
  if (asked?.kind === "image") {
    return { kind: "image", src: material[`${MATERIAL}${asked.icon}.svg`] ?? "" };
  }
  if (asked?.kind === "mask") {
    return { kind: "mask", className: `fi-g-${asked.glyph} fi-t-${asked.tone}` };
  }
  return null;
}
