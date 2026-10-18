// The messages between the page and nibtree-browser (src-tauri/browser/src/socket.rs), as JSON
// text over one WebSocket. Raw bytes (an editor's text, terminal output) travel as base64.

export interface CallMessage {
  type: "call";
  callId: number;
  command: string;
  args?: unknown;
  raw?: string;
}

export type ServerMessage =
  | { type: "hello"; tabLabel: string }
  | { type: "result"; callId: number; ok: boolean; value: unknown }
  | { type: "channel"; channelId: number; json?: string; raw?: string }
  | { type: "event"; event: string; payload: unknown };

const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** A call as it goes over the socket: raw bodies as base64, Channels as their "__CHANNEL__:<id>" JSON. */
export function callMessage(callId: number, command: string, args: unknown): CallMessage {
  if (args instanceof Uint8Array || args instanceof ArrayBuffer) {
    const bytes = args instanceof Uint8Array ? args : new Uint8Array(args);
    return { type: "call", callId, command, raw: toBase64(bytes) };
  }
  return { type: "call", callId, command, args: args ?? {} };
}

/** A Channel message as the page's Channel expects it: parsed JSON, or an ArrayBuffer for raw bytes. */
export function channelPayload(message: { json?: string; raw?: string }): unknown {
  if (message.raw !== undefined) {
    return fromBase64(message.raw);
  }
  return message.json === undefined ? null : JSON.parse(message.json);
}

export function parseServerMessage(text: string): ServerMessage | null {
  try {
    const message = JSON.parse(text) as ServerMessage;
    return message && typeof message === "object" && typeof message.type === "string" ? message : null;
  } catch {
    return null;
  }
}

/** The socket's URL next to the page, under the server's base path; `tabLabel` asks for the tab's old label. */
export function socketUrl(
  location: { protocol: string; host: string },
  basePath: string,
  tabLabel: string | null = null,
): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const query = tabLabel ? `?tab=${encodeURIComponent(tabLabel)}` : "";
  return `${scheme}://${location.host}${base}__nibtree/socket${query}`;
}
