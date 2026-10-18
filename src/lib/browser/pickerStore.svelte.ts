// The browser app's open and save dialog: transport.ts asks with the dialog plugin's request, PathPicker.svelte
// shows it and answers. One at a time; a new question answers the old one with null (cancelled).
import type { PickRequest } from "./pathPickerModel";

class PathPicker {
  request = $state.raw<PickRequest | null>(null);
  /** The folder the last choice was made in, where the next picker starts unless it is told a place. */
  lastFolder: string | null = null;
  #resolve: ((path: string | null) => void) | null = null;

  ask(request: PickRequest): Promise<string | null> {
    this.#resolve?.(null);
    this.request = request;
    return new Promise((resolve) => (this.#resolve = resolve));
  }

  answer(path: string | null, shownFolder: string | null = null): void {
    if (path !== null && shownFolder !== null) {
      this.lastFolder = shownFolder;
    }
    const resolve = this.#resolve;
    this.#resolve = null;
    this.request = null;
    resolve?.(path);
  }
}

export const pathPicker = new PathPicker();
