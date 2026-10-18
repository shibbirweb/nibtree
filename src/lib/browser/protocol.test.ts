import { describe, expect, it } from "vitest";

import { callMessage, channelPayload, fromBase64, parseServerMessage, socketUrl, toBase64 } from "./protocol";

describe("browser protocol", () => {
  it("round-trips bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(new Uint8Array(fromBase64(toBase64(bytes)))).toEqual(bytes);
  });

  it("sends raw bodies as base64 and JSON args as they are", () => {
    const raw = callMessage(3, "unsaved_write", new TextEncoder().encode("hi"));
    expect(raw).toEqual({ type: "call", callId: 3, command: "unsaved_write", raw: "aGk=" });
    const json = callMessage(4, "get_status", { repoPath: "/r" });
    expect(json).toEqual({ type: "call", callId: 4, command: "get_status", args: { repoPath: "/r" } });
    expect(callMessage(5, "memory_usage", undefined).args).toEqual({});
  });

  it("gives Channels parsed JSON or an ArrayBuffer", () => {
    expect(channelPayload({ json: '{"exit":0}' })).toEqual({ exit: 0 });
    const buffer = channelPayload({ raw: "aGk=" });
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(buffer as ArrayBuffer)).toBe("hi");
    expect(channelPayload({})).toBeNull();
  });

  it("ignores messages that are not the server's", () => {
    expect(parseServerMessage("not json")).toBeNull();
    expect(parseServerMessage("42")).toBeNull();
    expect(parseServerMessage('{"type":"hello","tabLabel":"tab-1"}')).toEqual({ type: "hello", tabLabel: "tab-1" });
  });

  it("puts the socket under the base path", () => {
    expect(socketUrl({ protocol: "http:", host: "127.0.0.1:4300" }, "/")).toBe("ws://127.0.0.1:4300/__nibtree/socket");
    expect(socketUrl({ protocol: "https:", host: "box.example" }, "/nib/")).toBe(
      "wss://box.example/nib/__nibtree/socket",
    );
    expect(socketUrl({ protocol: "http:", host: "h" }, "/nib")).toBe("ws://h/nib/__nibtree/socket");
  });
});
