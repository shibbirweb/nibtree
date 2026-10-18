/**
 * Smoke test of the browser version as npm installs it (.github/workflows/browser.yml runs it on every platform).
 *
 *     bun scripts/browser-smoke.ts --packages <folder> [--runtime <program>]
 *
 * Unpacks the tarballs from `bun scripts/npm-package.ts pack` into a fresh node_modules, then starts the launcher
 * with `--runtime` (default: this Bun; CI also passes Node) on a new repository and a new home folder: checks
 * --version, the token, the page, a WebSocket call or two, and that settings land in ~/.nibtree-browser only.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { tarballManifest, unpackPackage } from "./tarball";

const TOKEN = "smoke-test-token";
const TIMEOUT_MS = 60_000;

const args = process.argv.slice(2);
const valueOf = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const packages = resolve(valueOf("--packages") ?? "");
const runtime = valueOf("--runtime") ?? process.execPath;

function check(ok: unknown, message: string): void {
  if (!ok) {
    throw new Error(message);
  }
  console.log(`ok: ${message}`);
}

/** The tarballs unpacked where a package manager would put them. */
function install(root: string): string {
  for (const file of readdirSync(packages).filter((name) => name.endsWith(".tgz"))) {
    const tarball = join(packages, file);
    unpackPackage(tarball, join(root, "node_modules", ...tarballManifest(tarball).name.split("/")));
  }
  return join(root, "node_modules", "nibtree", "bin", "nibtree.mjs");
}

function makeRepo(folder: string): void {
  mkdirSync(folder, { recursive: true });
  const git = (...gitArgs: string[]) => execFileSync("git", gitArgs, { cwd: folder, stdio: "ignore" });
  git("init", "-q");
  writeFileSync(join(folder, "README.md"), "# smoke\n");
  git("add", "README.md");
  git("-c", "user.name=Smoke", "-c", "user.email=smoke@example.com", "commit", "-q", "-m", "first");
  writeFileSync(join(folder, "new.txt"), "untracked\n");
}

/** Sends calls over the page's socket and waits for each result. */
async function connect(url: URL, cookie: string) {
  const socketUrl = `ws://${url.host}/__nibtree/socket`;
  // Bun's WebSocket takes headers: the server wants the cookie and an Origin of its own address.
  const socket = new WebSocket(socketUrl, { headers: { cookie, origin: url.origin } } as unknown as string[]);
  const waiting = new Map<number, (message: { ok: boolean; value: unknown }) => void>();
  let hello: (label: string) => void = () => undefined;
  const helloLabel = new Promise<string>((done) => (hello = done));
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "hello") {
      hello(message.tabLabel);
    } else if (message.type === "result") {
      waiting.get(message.callId)?.(message);
    }
  });
  await new Promise((opened, failed) => {
    socket.addEventListener("open", opened);
    socket.addEventListener("error", () => failed(new Error(`could not open ${socketUrl}`)));
  });
  let nextId = 1;
  const call = (command: string, callArgs: Record<string, unknown>) => {
    const callId = nextId++;
    socket.send(JSON.stringify({ type: "call", callId, command, args: callArgs }));
    return new Promise<{ ok: boolean; value: unknown }>((done) => waiting.set(callId, done));
  };
  return { call, label: await helloLabel, close: () => socket.close() };
}

function stop(pid: number): void {
  if (process.platform === "win32") {
    // Killing the launcher alone would leave the server it started running.
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "nibtree-smoke-"));
  const launcher = install(root);
  const home = join(root, "home");
  const repo = join(root, "repo");
  mkdirSync(home);
  makeRepo(repo);
  const env = { ...process.env, HOME: home, USERPROFILE: home, NIBTREE_TOKEN: "" };

  const version = execFileSync(runtime, [launcher, "--version"], { encoding: "utf8", env }).trim();
  check(/^nibtree \d+\.\d+\.\d+/.test(version), `--version prints "${version}"`);

  const server = spawn(runtime, [launcher, repo, "--no-open", "--port", "0", "--token", TOKEN], { env });
  let output = "";
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const address = await new Promise<URL>((found, failed) => {
    server.stdout.on("data", (chunk) => {
      output += String(chunk);
      const match = /running at (\S+)/.exec(output);
      if (match) {
        found(new URL(match[1]));
      }
    });
    server.on("exit", (code) => failed(new Error(`the server stopped with ${code} before it was ready`)));
  });
  try {
    const denied = await fetch(new URL("/", address));
    check(denied.status === 401, `a page without the token is refused (${denied.status})`);
    const swap = await fetch(address, { redirect: "manual" });
    const cookie = (swap.headers.get("set-cookie") ?? "").split(";")[0];
    check(swap.status === 303 && cookie.startsWith("nibtree_browser_"), "the token in the address becomes a cookie");
    const page = await fetch(new URL("/", address), { headers: { cookie } });
    check(page.ok && (await page.text()).includes("__NIBTREE_BROWSER__"), "the cookie gets the page, set up for here");

    const socket = await connect(address, cookie);
    check(socket.label.length > 0, `the socket says hello to tab ${socket.label}`);
    const found = await socket.call("discover_repositories", { workspaceRoot: repo.replaceAll("\\", "/") });
    const repos = (found.value ?? []) as { root: string }[];
    check(found.ok && repos.length === 1, "discover_repositories finds the repository");
    const status = await socket.call("get_status", { repoPath: repos[0].root, knownHash: null });
    check(status.ok && JSON.stringify(status.value).includes("new.txt"), "get_status lists the untracked file");
    const desktopOnly = await socket.call("window_close", {});
    check(!desktopOnly.ok, "a desktop-only command answers with an error");
    const folder = await socket.call("config_dir", {});
    check(String(folder.value).endsWith(".nibtree-browser"), `the settings folder is ${folder.value}`);
    const saved = await socket.call("save_config", { configName: "settings", value: { roundedPanels: true } });
    check(saved.ok && existsSync(join(home, ".nibtree-browser", "settings.json")), "settings are saved there");
    socket.close();
    check(!existsSync(join(home, ".nibtree")), "the desktop app's ~/.nibtree is left alone");
  } finally {
    stop(server.pid!);
  }
  const code = await new Promise((done) => server.on("exit", (exitCode, signal) => done(signal ?? exitCode)));
  console.log(`the server stopped (${code})`);
}

const timer = setTimeout(() => {
  console.error(`the smoke test took longer than ${TIMEOUT_MS / 1000} s`);
  process.exit(1);
}, TIMEOUT_MS);
main()
  .then(() => {
    clearTimeout(timer);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
