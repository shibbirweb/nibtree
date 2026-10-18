/**
 * Smoke test of the browser version as people get it (.github/workflows/browser.yml runs it on every platform).
 *
 *     bun scripts/browser-smoke.ts --packages <folder> [--runtime <program>]
 *     bun scripts/browser-smoke.ts --docker <image>
 *
 * --packages unpacks the tarballs from `bun scripts/npm-package.ts pack` into a fresh node_modules and starts the
 * launcher with --runtime (default: this Bun; CI also passes Node). --docker runs the image instead, as the
 * current user, with a mapped port and mounted folders. Either way it gets a new repository and a new home folder,
 * then checks --version, the token, the page, the socket, git reads and a commit through the git command, and
 * that settings land in ~/.nibtree-browser only.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { tarballManifest, unpackPackage } from "./tarball";

const TOKEN = "smoke-test-token";
const TIMEOUT_MS = 120_000;
const DOCKER_PORT = 4410;
const IDENTITY = {
  GIT_AUTHOR_NAME: "Smoke",
  GIT_AUTHOR_EMAIL: "smoke@example.com",
  GIT_COMMITTER_NAME: "Smoke",
  GIT_COMMITTER_EMAIL: "smoke@example.com",
};

const args = process.argv.slice(2);
const valueOf = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const image = valueOf("--docker");
const runtime = valueOf("--runtime") ?? process.execPath;

interface Server {
  address: URL;
  /** The repository's path as the server sees it. */
  workspace: string;
  process: ChildProcess;
  stop: () => void;
}

function check(ok: unknown, message: string): void {
  if (!ok) {
    throw new Error(message);
  }
  console.log(`ok: ${message}`);
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

/** The address the server prints once it listens. */
function printedAddress(child: ChildProcess): Promise<URL> {
  let output = "";
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  return new Promise((found, failed) => {
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      const match = /running at (\S+)/.exec(output);
      if (match) {
        found(new URL(match[1]));
      }
    });
    child.on("exit", (code) => failed(new Error(`the server stopped with ${code} before it was ready`)));
  });
}

async function startLauncher(root: string, home: string, repo: string): Promise<Server> {
  const packages = resolve(valueOf("--packages") ?? "");
  for (const file of readdirSync(packages).filter((name) => name.endsWith(".tgz"))) {
    const tarball = join(packages, file);
    unpackPackage(tarball, join(root, "node_modules", ...tarballManifest(tarball).name.split("/")));
  }
  const launcher = join(root, "node_modules", "nibtree", "bin", "nibtree.mjs");
  const env = { ...process.env, ...IDENTITY, HOME: home, USERPROFILE: home, NIBTREE_TOKEN: "" };
  const version = execFileSync(runtime, [launcher, "--version"], { encoding: "utf8", env }).trim();
  check(/^nibtree \d+\.\d+\.\d+/.test(version), `--version prints "${version}"`);

  const child = spawn(runtime, [launcher, repo, "--no-open", "--port", "0", "--token", TOKEN], { env });
  const stop = () => {
    if (process.platform === "win32") {
      // Killing the launcher alone would leave the server it started running.
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  };
  return { address: await printedAddress(child), workspace: repo.replaceAll("\\", "/"), process: child, stop };
}

function freePort(): Promise<number> {
  return new Promise((found) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => found(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function startDocker(dockerImage: string, home: string, repo: string): Promise<Server> {
  const docker = (...dockerArgs: string[]) => execFileSync("docker", dockerArgs, { encoding: "utf8" }).trim();
  const version = docker("run", "--rm", dockerImage, "--version");
  check(/^nibtree \d+\.\d+\.\d+/.test(version), `--version prints "${version}"`);
  const tools = docker(
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    dockerImage,
    "-c",
    "git --version && git lfs version && ssh -V 2>&1 && gpg --version | head -n 1 && bash --version | head -n 1",
  );
  check(/git version/.test(tools) && /git-lfs/.test(tools), "the image has git and git-lfs");
  check(/OpenSSH/.test(tools) && /GnuPG/.test(tools) && /bash/.test(tools), "and ssh, gpg and bash");

  const port = await freePort();
  const name = `nibtree-smoke-${process.pid}`;
  const user = process.getuid && process.getgid ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];
  const identity = Object.entries(IDENTITY).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  const runArgs = ["run", "--rm", "--name", name, "-p", `127.0.0.1:${port}:${DOCKER_PORT}`, ...user, ...identity];
  const env = ["-e", `NIBTREE_TOKEN=${TOKEN}`, "-e", `NIBTREE_PUBLIC_URL=http://127.0.0.1:${port}`];
  const mounts = ["-v", `${repo}:/workspace`, "-v", `${home}:/home/nibtree`];
  const child = spawn("docker", [...runArgs, ...env, ...mounts, dockerImage]);
  const address = await printedAddress(child);
  check(address.port === String(port), `the printed address is the public one (${address.origin})`);
  const stop = () => execFileSync("docker", ["stop", "--time", "10", name], { stdio: "ignore" });
  return { address, workspace: "/workspace", process: child, stop };
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

async function checkServer(server: Server, home: string): Promise<void> {
  const { address } = server;
  const denied = await fetch(new URL("/", address));
  check(denied.status === 401, `a page without the token is refused (${denied.status})`);
  const swap = await fetch(address, { redirect: "manual" });
  const cookie = (swap.headers.get("set-cookie") ?? "").split(";")[0];
  check(swap.status === 303 && cookie.startsWith("nibtree_browser_"), "the token in the address becomes a cookie");
  const page = await fetch(new URL("/", address), { headers: { cookie } });
  check(page.ok && (await page.text()).includes("__NIBTREE_BROWSER__"), "the cookie gets the page, set up for here");

  const socket = await connect(address, cookie);
  check(socket.label.length > 0, `the socket says hello to tab ${socket.label}`);
  const found = await socket.call("discover_repositories", { workspaceRoot: server.workspace });
  const repos = (found.value ?? []) as { root: string }[];
  check(found.ok && repos.length === 1, "discover_repositories finds the repository");
  const repoPath = repos[0].root;
  const status = await socket.call("get_status", { repoPath, knownHash: null });
  check(status.ok && JSON.stringify(status.value).includes("new.txt"), "get_status lists the untracked file");
  const staged = await socket.call("stage_files", { repoPath, filePaths: ["new.txt"] });
  const commit = await socket.call("commit", { repoPath, message: "second", amend: false, options: null });
  const committed = staged.ok && commit.ok;
  check(committed, committed ? "the git command stages and commits" : `commit failed: ${JSON.stringify(commit.value)}`);
  const after = await socket.call("get_status", { repoPath, knownHash: null });
  check(after.ok && !JSON.stringify(after.value).includes("new.txt"), "and the commit leaves a clean status");
  const desktopOnly = await socket.call("window_close", {});
  check(!desktopOnly.ok, "a desktop-only command answers with an error");
  const folder = await socket.call("config_dir", {});
  check(String(folder.value).endsWith(".nibtree-browser"), `the settings folder is ${folder.value}`);
  const saved = await socket.call("save_config", { configName: "settings", value: { roundedPanels: true } });
  check(saved.ok && existsSync(join(home, ".nibtree-browser", "settings.json")), "settings are saved there");
  socket.close();
  check(!existsSync(join(home, ".nibtree")), "the desktop app's ~/.nibtree is left alone");
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "nibtree-smoke-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  mkdirSync(home);
  makeRepo(repo);
  const server = image ? await startDocker(image, home, repo) : await startLauncher(root, home, repo);
  const exited = new Promise((done) => server.process.on("exit", (code, signal) => done(signal ?? code)));
  const stopping = { at: 0 };
  try {
    await checkServer(server, home);
  } finally {
    stopping.at = Date.now();
    server.stop();
  }
  const code = await exited;
  const seconds = (Date.now() - stopping.at) / 1000;
  // `docker stop` waits 10 s and then kills: a quick stop means tini passed the signal on.
  check(seconds < 8, `the server stopped (${code}) in ${seconds.toFixed(1)} s`);
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
