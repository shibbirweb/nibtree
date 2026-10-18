// The page's side of nibtree-browser (src-tauri/browser): when the server serves the page, Tauri's IPC
// is replaced by one WebSocket before the app starts, so `src/lib/api.ts` and every other `invoke`
// work unchanged. Channels and backend events come back over the same socket. Desktop window
// commands and Tauri plugins have browser answers here instead. See docs/plans/browser-app-plan.md.

import { Channel } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import { callMessage, channelPayload, parseServerMessage, socketUrl, type ServerMessage } from "./protocol";

type Args = Record<string, unknown>;

/** Commands the page answers itself: what a desktop window does, done by the browser tab. */
const LOCAL_COMMANDS: Record<string, (args: Args) => unknown> = {
  window_set_workspace: (args) => {
    document.title = typeof args.title === "string" && args.title.trim() ? args.title : "Nibtree";
    return null;
  },
  window_focus_owner: () => null,
  window_open: () => {
    window.open(location.href, "_blank");
    return { windowLabel: "", existing: false };
  },
  window_close: () => {
    window.close();
    return null;
  },
  clear_cache: () => {
    location.reload();
    return null;
  },
  "plugin:app|version": () => window.__NIBTREE_BROWSER__?.version ?? "",
  "plugin:app|name": () => "Nibtree",
  "plugin:window|is_fullscreen": () => false,
  "plugin:opener|open_url": (args) => {
    window.open(String(args.url ?? ""), "_blank", "noopener");
    return null;
  },
};

export function startBrowserTransport(): void {
  const basePath = window.__NIBTREE_BROWSER__?.basePath ?? "/";
  const socket = new WebSocket(socketUrl(location, basePath));
  const opened = new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }));
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  const channels = new Map<number, Channel<unknown>>();
  const warned = new Set<string>();
  let nextCallId = 1;

  socket.addEventListener("message", (event) => {
    const message = typeof event.data === "string" ? parseServerMessage(event.data) : null;
    if (message) {
      receive(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject({ kind: "blocked", message: "Nibtree stopped: start it again and reload this page" });
    }
    pending.clear();
  });

  function receive(message: ServerMessage): void {
    if (message.type === "result") {
      const waiter = pending.get(message.callId);
      pending.delete(message.callId);
      if (message.ok) {
        waiter?.resolve(message.value);
      } else {
        waiter?.reject(message.value);
      }
    } else if (message.type === "channel") {
      channels.get(message.channelId)?.onmessage(channelPayload(message));
    } else if (message.type === "event") {
      void emit(message.event, message.payload);
    }
  }

  mockWindows("main");
  mockIPC(
    (command, args) => {
      const local = LOCAL_COMMANDS[command];
      if (local) {
        return local((args ?? {}) as Args);
      }
      if (command.startsWith("plugin:")) {
        if (!warned.has(command)) {
          warned.add(command);
          console.warn(`Not available in the browser yet: ${command}`);
        }
        return null;
      }
      for (const value of args instanceof Uint8Array ? [] : Object.values((args ?? {}) as Args)) {
        if (value instanceof Channel) {
          channels.set(value.id, value);
        }
      }
      const callId = nextCallId++;
      const text = JSON.stringify(callMessage(callId, command, args));
      return opened.then(
        () =>
          new Promise((resolve, reject) => {
            pending.set(callId, { resolve, reject });
            socket.send(text);
          }),
      );
    },
    { shouldMockEvents: true },
  );
}
