// What the diff editors listen to on every side (diffEditors.svelte.ts): the change keys, the lines moving on screen
// and the selection.
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/** F7 and Shift+F7 step to the next and the previous change. */
export function changeKeys(go: (direction: 1 | -1) => boolean): Extension {
  return keymap.of([
    { key: "F7", run: () => go(1) },
    { key: "Shift-F7", run: () => go(-1) },
  ]);
}

/** Calls `onMove` whenever the lines move on screen, so the ruler and the bands follow them. */
export function geometryWatch(onMove: () => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged || update.geometryChanged || update.heightChanged || update.viewportChanged) {
      onMove();
    }
  });
}

/** `onPick` when a selection is made in this side or it takes focus, `onSelection` when its selection changes. */
export function selectionWatch(onPick: () => void, onSelection: () => void): Extension {
  return EditorView.updateListener.of((update) => {
    const picked = update.transactions.some((transaction) => transaction.isUserEvent("select"));
    if (picked || (update.focusChanged && update.view.hasFocus)) {
      onPick();
    }
    if (update.selectionSet || update.focusChanged) {
      onSelection();
    }
  });
}
