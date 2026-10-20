// The diff toolbar buttons of a view that can show 3 columns: they change the same settings as Settings > Git.
import { type DiffLayout, settings } from "$lib/stores/settings.svelte";

type PanesKey = "changesDiffPanes" | "mergeDiffPanes";

/** Side by side, Aligned or Inline from the 3-column toolbar: Side by side there means 2 columns. */
export function setDiffLayout(panesKey: PanesKey, layout: DiffLayout): void {
  settings.setPreference("diffLayout", layout);
  if (layout === "sideBySide") {
    settings.setPreference(panesKey, "two");
  }
}

/** The 3-column button of the 2-column (or inline) toolbar. */
export function showThreeColumns(panesKey: PanesKey): void {
  settings.setPreference("diffLayout", "sideBySide");
  settings.setPreference(panesKey, "three");
}

/** The 3-column layout is on for this view: side by side, with 3 columns picked. */
export function showsThreeColumns(panesKey: PanesKey): boolean {
  return settings.diffLayout === "sideBySide" && settings[panesKey] === "three";
}
