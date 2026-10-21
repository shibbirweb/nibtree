import { describe, expect, it } from "vitest";
import { NO_PAGE_CLIPBOARD, readPageClipboard } from "./pageClipboard";

describe("readPageClipboard", () => {
  it("reads the browser's clipboard", async () => {
    await expect(readPageClipboard({ readText: async () => "diff --git a/x b/x" })).resolves.toBe("diff --git a/x b/x");
  });

  it("explains when the browser cannot or will not read it", async () => {
    const error = { kind: "invalid", message: NO_PAGE_CLIPBOARD };
    await expect(readPageClipboard(undefined)).rejects.toEqual(error);
    await expect(readPageClipboard({})).rejects.toEqual(error);
    await expect(readPageClipboard({ readText: () => Promise.reject(new Error("NotAllowedError")) })).rejects.toEqual(
      error,
    );
  });
});
