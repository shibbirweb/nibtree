// Commands the page answers itself in a browser tab: what a desktop window or a Tauri plugin does, done by the tab.
// Windows are tabs (tabs.ts), the open and save dialogs are the page's picker (PathPicker.svelte), web links open
// in the browser, and the clipboard is the browser's. Reveal in Finder and opening a file with its app go to the
// server (src-tauri/browser/opener.rs).

import { replaceState } from "$app/navigation";
import { closeThisTab } from "./closedTab.svelte";
import { readPageClipboard } from "./pageClipboard";
import { pickRequest } from "./pathPickerModel";
import { pathPicker } from "./pickerStore.svelte";
import { tabOpenFrom, tabUrl, type TabOpen } from "./tabs";

type Args = Record<string, unknown>;

/** What a local command returns when the server should answer after all. */
const SEND_TO_SERVER = Symbol("send to server");

/** The plugin calls the server does; every other `plugin:` call without an answer here is a quiet no-op. */
export const SERVER_PLUGIN_COMMANDS = new Set(["plugin:opener|open_path", "plugin:opener|reveal_item_in_dir"]);

function openOf(args: Args): TabOpen {
  const folderPaths = Array.isArray(args.folderPaths)
    ? args.folderPaths.filter((path): path is string => typeof path === "string")
    : [];
  return { folderPaths, workspaceFile: typeof args.workspaceFile === "string" ? args.workspaceFile : null };
}

/** The tab keeps what it shows in its address, so a reload reopens it. */
function rememberInAddress(open: TabOpen): void {
  const url = tabUrl(location.href, open);
  try {
    replaceState(url, {});
  } catch {
    // Before the router starts SvelteKit refuses; the plain history call does the same.
    history.replaceState(history.state, "", url);
  }
}

function ask(kind: "open" | "save", args: Args): Promise<string | string[] | null> {
  const request = pickRequest(kind, args.options);
  return pathPicker.ask(request).then((path) => (path !== null && request.multiple ? [path] : path));
}

/** The answer to a command the page handles, or undefined to send it to the server. */
export function answerLocally(command: string, args: Args): { answer: unknown } | undefined {
  const local = LOCAL_COMMANDS[command];
  if (!local) {
    return undefined;
  }
  const answer = local(args);
  return answer === SEND_TO_SERVER ? undefined : { answer };
}

const LOCAL_COMMANDS: Record<string, (args: Args) => unknown> = {
  // The person's clipboard is the browser's; the server's (pbpaste there) may be another machine's, or none.
  read_clipboard_text: () => readPageClipboard(navigator.clipboard),
  // A tab opened for some folders starts with them; the first tab asks the server (command line, session).
  window_startup: () => {
    const open = tabOpenFrom(location.search);
    return open ? { kind: "open", label: "main", open } : SEND_TO_SERVER;
  },
  window_set_workspace: (args) => {
    document.title = typeof args.title === "string" && args.title.trim() ? args.title : "Nibtree";
    rememberInAddress(openOf(args));
    return null;
  },
  // Tabs cannot bring another tab to the front: a workspace opens here even when another tab shows it.
  window_focus_owner: () => null,
  window_open: (args) => {
    const tab = window.open(tabUrl(location.href, openOf(args)), "_blank");
    if (!tab) {
      return Promise.reject({
        kind: "blocked",
        message: "The browser blocked the new tab: allow pop-ups for this page",
      });
    }
    return { windowLabel: "", existing: false };
  },
  window_close: () => {
    closeThisTab();
    return null;
  },
  clear_cache: () => {
    location.reload();
    return null;
  },
  "plugin:dialog|open": (args) => ask("open", args),
  "plugin:dialog|save": (args) => ask("save", args),
  "plugin:app|version": () => window.__NIBTREE_BROWSER__?.version ?? "",
  "plugin:app|name": () => "Nibtree",
  "plugin:window|is_fullscreen": () => false,
  "plugin:opener|open_url": (args) => {
    window.open(String(args.url ?? ""), "_blank", "noopener");
    return null;
  },
};
