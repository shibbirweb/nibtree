// The window's title bar on macOS: the windows hide the system title strip (titleBarStyle Overlay), so the close,
// minimize and zoom buttons sit at the left of the app's own top bar. That bar then leaves room
// for them and moves the window. In full screen macOS hides the buttons, so the room goes too.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isBrowserHost } from "$lib/browser/host";
import { currentPlatform } from "$lib/commands/commandRuntime";
import { projectTintFor } from "./projectTint";
import { repoStore } from "./repo.svelte";
import { settings } from "./settings.svelte";

class WindowChrome {
  #fullscreen = $state(false);
  #started = false;

  /** The window's own buttons sit in the app's top bar (not in a browser tab, which has none). */
  readonly controlsInBar = $derived(currentPlatform() === "macos" && !isBrowserHost() && !this.#fullscreen);

  /** The open project's color for the top bar and the window frame, or none when it is turned off. */
  readonly tint = $derived(projectTintFor(settings.projectColorHeader, repoStore.workspace?.id ?? null));

  /** Follows full screen; safe to call more than once, and quiet outside the app window (tests, the showcase). */
  start(): void {
    if (this.#started || currentPlatform() !== "macos" || isBrowserHost()) {
      return;
    }
    this.#started = true;
    void (async () => {
      try {
        const appWindow = getCurrentWindow();
        const check = async () => {
          this.#fullscreen = await appWindow.isFullscreen();
        };
        await check();
        await appWindow.onResized(() => void check());
      } catch {
        this.#fullscreen = false;
      }
    })();
  }
}

export const windowChrome = new WindowChrome();
