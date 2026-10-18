// Close Window in a browser tab. Browsers let a page close only the tabs it opened itself; any other tab shows
// TabClosed.svelte instead. Either way the page tells the server first, which frees what the tab owned (its
// terminals, watchers and searches) as a closed desktop window. The tab's label survives reloads in session
// storage, so a reload keeps them (src-tauri/browser/src/socket.rs).

const LABEL_KEY = "nibtree-tab";

export const closedTab = $state({ closed: false });

let closeConnection: (() => void) | null = null;

/** transport.ts: how to tell the server this tab is closing. */
export function setCloseConnection(close: () => void): void {
  closeConnection = close;
}

export function closeThisTab(): void {
  closeConnection?.();
  window.close();
  // A tab the browser keeps open says so; a closed one never runs this.
  setTimeout(() => {
    if (!window.closed) {
      closedTab.closed = true;
    }
  }, 200);
}

/** The label this tab had before a reload, if any. */
export function savedTabLabel(): string | null {
  try {
    return sessionStorage.getItem(LABEL_KEY);
  } catch {
    return null;
  }
}

export function saveTabLabel(label: string): void {
  try {
    sessionStorage.setItem(LABEL_KEY, label);
  } catch {
    // Without session storage a reload is a new tab: the server frees the old one after a short wait.
  }
}
