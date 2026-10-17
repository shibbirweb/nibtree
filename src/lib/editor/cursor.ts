// The editors' cursor: its shape, width, blinking, smooth movement and how far it reaches above and below the text.
// Open editors follow the settings through a compartment, like the whitespace setting.

import { Compartment, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { BLINK_MS, type CursorOptions, cursorThemeSpec } from "@nibtree/ui/editor/cursorStyle";
import type { Preferences } from "$lib/stores/settingsData";

export { BLINK_MS, type CursorOptions, cursorThemeSpec };

/** The settings that shape the cursor. */
export type CursorPreferences = Pick<
  Preferences,
  | "editorCursorStyle"
  | "editorCursorWidth"
  | "editorCursorBlinking"
  | "editorCursorSmoothCaret"
  | "editorCaretExtraTop"
  | "editorCaretExtraBottom"
>;

/** The cursor options in the settings. */
export function cursorOptions(preferences: CursorPreferences): CursorOptions {
  return {
    style: preferences.editorCursorStyle,
    width: preferences.editorCursorWidth,
    blinking: preferences.editorCursorBlinking,
    smoothCaret: preferences.editorCursorSmoothCaret,
    extraTop: preferences.editorCaretExtraTop,
    extraBottom: preferences.editorCaretExtraBottom,
  };
}

/** Same options, same theme, so dragging a slider back and forth adds no new styles. */
const themes = new Map<string, Extension>();

function themeFor(options: CursorOptions): Extension {
  const key = JSON.stringify(options);
  let theme = themes.get(key);
  if (!theme) {
    theme = EditorView.theme(cursorThemeSpec(options));
    themes.set(key, theme);
  }
  return theme;
}

/**
 * Keeps the character width the block and underline cursors use up to date, and restarts the
 * blink when the cursor moves so it stays visible while you type. It writes to the scroller,
 * which CodeMirror's own attribute handling leaves alone.
 */
const cursorTracker = ViewPlugin.fromClass(
  class {
    private copy: "a" | "b" = "a";

    constructor(view: EditorView) {
      view.scrollDOM.dataset.gmBlink = this.copy;
      this.measure(view);
    }

    update(update: ViewUpdate): void {
      if (update.selectionSet || update.docChanged) {
        this.copy = this.copy === "a" ? "b" : "a";
        update.view.scrollDOM.dataset.gmBlink = this.copy;
      }
      if (update.geometryChanged) {
        this.measure(update.view);
      }
    }

    private measure(view: EditorView): void {
      view.scrollDOM.style.setProperty("--gm-char-width", `${view.defaultCharacterWidth}px`);
    }
  },
);

const compartment = new Compartment();
const views = new Set<EditorView>();

const registry = ViewPlugin.define((view) => {
  views.add(view);
  return {
    destroy() {
      views.delete(view);
    },
  };
});

/** The cursor extension for a new editor. */
export function editorCursor(options: CursorOptions): Extension {
  return [registry, cursorTracker, compartment.of(themeFor(options))];
}

/** Makes every open editor measure again: CodeMirror does not notice a font change made through CSS variables. */
export function remeasureEditors(): void {
  for (const view of views) {
    view.requestMeasure();
  }
}

/** Applies new cursor options to every open editor. */
export function setEditorCursor(options: CursorOptions): void {
  const effects = compartment.reconfigure(themeFor(options));
  for (const view of views) {
    view.dispatch({ effects });
  }
}
