import { describe, expect, it } from "vitest";
import { distinctFolderHints } from "./tabHints";

describe("distinctFolderHints", () => {
  it("uses the parent folder when it is enough", () => {
    expect(distinctFolderHints(["apps/web/index.ts", "apps/api/index.ts"])).toEqual(["web", "api"]);
  });

  it("goes up until the folders differ", () => {
    expect(distinctFolderHints(["/w/shop/prices.ts", "/w/shop-fix-tax/prices.ts"])).toEqual(["shop", "shop-fix-tax"]);
    expect(distinctFolderHints(["/a/x/i.ts", "/b/x/i.ts", "/c/y/i.ts"])).toEqual(["a/x", "b/x", "y"]);
  });

  it("gives a file with no folder no hint", () => {
    expect(distinctFolderHints(["i.ts", "x/i.ts"])).toEqual([null, "x"]);
  });
});
