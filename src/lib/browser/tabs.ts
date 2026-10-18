// Browser tabs as the desktop app's windows: a new window is a new tab whose address says what it shows, and each
// tab keeps what it shows in its address as it changes, so a reload reopens it (the desktop app keeps that in its
// window book, src-tauri/src/windows.rs).

export interface TabOpen {
  folderPaths: string[];
  workspaceFile: string | null;
}

const PARAM = "open";

/** This page's address showing `open`; other query parameters and the hash go. */
export function tabUrl(href: string, open: TabOpen): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(PARAM, JSON.stringify(open));
  return url.toString();
}

/** What a tab's address says it shows; null when it says nothing (the first tab: the command line or session). */
export function tabOpenFrom(search: string): TabOpen | null {
  const text = new URLSearchParams(search).get(PARAM);
  if (text === null) {
    return null;
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const folderPaths = Array.isArray(data.folderPaths)
      ? data.folderPaths.filter((path): path is string => typeof path === "string" && path !== "")
      : [];
    const workspaceFile = typeof data.workspaceFile === "string" && data.workspaceFile ? data.workspaceFile : null;
    return { folderPaths, workspaceFile };
  } catch {
    return null;
  }
}
