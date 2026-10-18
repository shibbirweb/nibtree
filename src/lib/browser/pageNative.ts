// The system menu items (menuSpec.ts NativeItem) a browser tab can do itself, for the page's menu bar.
// Hide, Minimize, Quit and the like have no browser twin and are left out (null).

import type { NativeItem } from "$lib/menu/menuSpec";

export function pageNativeItem(item: NativeItem): (() => void) | null {
  switch (item) {
    case "Cut":
      return () => document.execCommand("cut");
    case "Copy":
      return () => document.execCommand("copy");
    case "Paste":
      // Browsers ask the person first; a refusal only leaves the text where it was.
      return () => {
        void navigator.clipboard
          .readText()
          .then((text) => document.execCommand("insertText", false, text))
          .catch(() => undefined);
      };
    case "Fullscreen":
      return () => {
        const done = document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen();
        void done.catch(() => undefined);
      };
    case "CloseWindow":
      return () => window.close();
    default:
      return null;
  }
}
