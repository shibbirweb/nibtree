import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { binaryName, platformFor, platformForTarget, PLATFORMS } from "../npm/nibtree/lib/platforms.mjs";
import { distTag, manifestProblems, platformManifest, publishOrder, withVersion, type Manifest } from "./npmPackages";

const launcher = (): Manifest => JSON.parse(readFileSync("npm/nibtree/package.json", "utf8")) as Manifest;
const cargoVersion = (): string => /^version = "([^"]+)"/m.exec(readFileSync("src-tauri/Cargo.toml", "utf8"))![1];

describe("npm packages", () => {
  it("finds a platform by Node's names and by Rust's target", () => {
    expect(platformFor("darwin", "arm64")?.target).toBe("aarch64-apple-darwin");
    expect(platformFor("linux", "ia32")).toBeNull();
    expect(platformForTarget("x86_64-pc-windows-msvc")?.os).toBe("win32");
    expect(binaryName("win32")).toBe("nibtree-browser.exe");
    expect(binaryName("linux")).toBe("nibtree-browser");
    expect(new Set(PLATFORMS.map((platform) => platform.target)).size).toBe(PLATFORMS.length);
  });

  it("limits each platform package to its os and cpu", () => {
    const mac = platformManifest(platformFor("darwin", "x64")!, "1.2.3");
    expect([mac.name, mac.version, mac.os, mac.cpu, mac.libc]).toEqual([
      "@nibtree/darwin-x64",
      "1.2.3",
      ["darwin"],
      ["x64"],
      undefined,
    ]);
    expect(platformManifest(platformFor("linux", "arm64")!, "1.2.3").libc).toEqual(["glibc"]);
  });

  it("publishes betas to next and stable versions to latest", () => {
    expect(distTag("0.2.0-beta.3")).toBe("next");
    expect(distTag("0.2.0")).toBe("latest");
  });

  it("pins every platform package to the launcher's version", () => {
    const manifest = withVersion({ name: "nibtree", version: "0.1.0", optionalDependencies: { old: "1" } }, "0.2.0");
    expect(manifestProblems(manifest, "0.2.0")).toEqual([]);
    expect(Object.keys(manifest.optionalDependencies!)).toHaveLength(PLATFORMS.length);
    expect(manifestProblems({ ...manifest, version: "0.1.0" }, "0.2.0")).toEqual(["its version is 0.1.0, not 0.2.0"]);
    const extra = {
      ...manifest,
      optionalDependencies: { ...manifest.optionalDependencies, "@nibtree/aix-ppc": "0.2.0" },
    };
    expect(manifestProblems(extra, "0.2.0")).toEqual([
      "@nibtree/aix-ppc is not a platform in npm/nibtree/lib/platforms.mjs",
    ]);
  });

  it("keeps the committed launcher at the app's version", () => {
    expect(manifestProblems(launcher(), cargoVersion())).toEqual([]);
  });

  it("publishes the launcher last", () => {
    expect(publishOrder(["nibtree", "@nibtree/linux-x64", "@nibtree/win32-x64"])).toEqual([
      "@nibtree/linux-x64",
      "@nibtree/win32-x64",
      "nibtree",
    ]);
  });
});
