export async function init(): Promise<void> {
  // Served by nibtree-browser: commands go over its socket instead of Tauri's IPC.
  if (window.__NIBTREE_BROWSER__) {
    const { startBrowserTransport } = await import("$lib/browser/transport");
    startBrowserTransport();
    return;
  }
  if (import.meta.env.DEV) {
    const { startIpcBridge } = await import("$lib/dev/ipcBridge");
    startIpcBridge();
  }
}
