// Whether nibtree-browser (src-tauri/browser) serves this page instead of the desktop app. Kept
// apart from transport.ts so checking it does not load the socket code.

declare global {
  interface Window {
    /** Set by nibtree-browser in index.html. */
    __NIBTREE_BROWSER__?: { basePath: string; version: string };
  }
}

export function isBrowserHost(): boolean {
  return typeof window !== "undefined" && window.__NIBTREE_BROWSER__ !== undefined;
}
