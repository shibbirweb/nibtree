#!/usr/bin/env node
// `npx nibtree`: starts nibtree-browser from this machine's platform package (@nibtree/<os>-<cpu>). Each one is an
// optional dependency limited to its os and cpu, so the package manager installs only the one that fits.
// NIBTREE_BINARY runs another build instead (development).

import { spawn } from "node:child_process";
import { chmodSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { binaryName, packageName, platformFor } from "../lib/platforms.mjs";

const require = createRequire(import.meta.url);

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message);
  process.exit(1);
}

function binaryPath() {
  if (process.env.NIBTREE_BINARY) {
    return process.env.NIBTREE_BINARY;
  }
  const platform = platformFor(process.platform, process.arch);
  if (!platform) {
    fail(`Nibtree has no build for ${process.platform} on ${process.arch} yet.`);
  }
  const name = packageName(platform);
  try {
    return join(dirname(require.resolve(`${name}/package.json`)), "bin", binaryName(platform.os));
  } catch {
    fail(`${name} is not installed. Install nibtree again with its optional dependencies (no --omit=optional).`);
  }
}

/** Some package managers drop the executable bit when they unpack a package. */
function makeExecutable(binary) {
  if (process.platform === "win32") {
    return;
  }
  try {
    if ((statSync(binary).mode & 0o111) === 0) {
      chmodSync(binary, 0o755);
    }
  } catch {
    // spawn reports a missing or unreadable program below.
  }
}

const binary = binaryPath();
makeExecutable(binary);
const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
const forwarded = ["SIGINT", "SIGTERM", "SIGHUP"];
for (const signal of forwarded) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (err) => fail(`Could not start ${binary}: ${err.message}`));
child.on("exit", (code, signal) => {
  if (signal) {
    // End the same way the server did, so a shell sees the signal and not a plain exit code.
    for (const name of forwarded) {
      process.removeAllListeners(name);
    }
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
