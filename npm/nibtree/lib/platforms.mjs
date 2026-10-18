// Every platform the browser version is built for. Each gets its own npm package (@nibtree/<os>-<cpu>) with the
// nibtree-browser program and the page; scripts/npm-package.ts writes them and .github/workflows/browser.yml
// builds them. `os` and `cpu` are Node's names (process.platform, process.arch), `target` is Rust's.

export const SCOPE = "@nibtree";

/** @typedef {{ os: "darwin" | "linux" | "win32", cpu: "arm64" | "x64", target: string, title: string }} Platform */

/** @type {Platform[]} */
export const PLATFORMS = [
  { os: "darwin", cpu: "arm64", target: "aarch64-apple-darwin", title: "macOS on Apple silicon" },
  { os: "darwin", cpu: "x64", target: "x86_64-apple-darwin", title: "macOS on Intel" },
  { os: "linux", cpu: "x64", target: "x86_64-unknown-linux-gnu", title: "Linux on x64" },
  { os: "linux", cpu: "arm64", target: "aarch64-unknown-linux-gnu", title: "Linux on Arm" },
  { os: "win32", cpu: "x64", target: "x86_64-pc-windows-msvc", title: "Windows on x64" },
  { os: "win32", cpu: "arm64", target: "aarch64-pc-windows-msvc", title: "Windows on Arm" },
];

/** @param {Platform} platform */
export function packageName(platform) {
  return `${SCOPE}/${platform.os}-${platform.cpu}`;
}

/** @param {string} os @param {string} cpu @returns {Platform | null} */
export function platformFor(os, cpu) {
  return PLATFORMS.find((platform) => platform.os === os && platform.cpu === cpu) ?? null;
}

/** @param {string} target @returns {Platform | null} */
export function platformForTarget(target) {
  return PLATFORMS.find((platform) => platform.target === target) ?? null;
}

/** @param {string} os */
export function binaryName(os) {
  return os === "win32" ? "nibtree-browser.exe" : "nibtree-browser";
}
