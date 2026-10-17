#!/usr/bin/env bun
/**
 * Regenerates every wiki screenshot in docs/wiki/images. Each shot is a define() call below, named
 * after its image; docs/wiki/features.json assigns the images to features and pages.
 *
 * How it works: a WebKit page (Playwright) opens the dev server with `?ipc-bridge`. The page mocks
 * Tauri's IPC and relays every command to the running app, which runs it with the real Rust backend
 * and real git (see src/lib/dev/ipcBridge.ts). The page answers a few commands itself so nothing
 * touches your own setup: settings and state live in memory, the launch mode points at the demo
 * workspace, and OS dialogs, the opener and window commands never reach the app. Any other command
 * with an absolute path outside the demo folder is refused.
 *
 * Every run rebuilds the demo in /tmp/nibtree-docs with scripts/make-docs-demo.sh, so paths in the
 * UI are stable and nothing from an earlier run leaks into the next.
 *
 * Prerequisites:
 *   GM_IPC_BRIDGE=1 bun tauri dev      the app, with the bridge on, left running in another terminal
 *   bunx --bun playwright install webkit   once, for the browser engine
 *
 * Usage:
 *   bun scripts/screenshots.ts                 regenerate every screenshot
 *   bun scripts/screenshots.ts merge-tool blame-gutter.png   only these (with or without .png)
 *   bun scripts/screenshots.ts --list          print the screenshot names
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, type Locator, type Page, webkit } from "playwright";
import { previewOf } from "../src/lib/views/files/mediaPreview";

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(PROJECT, "docs/wiki/images");
const DEMO_DIR = "/tmp/nibtree-docs";
const DEV_SERVER = "http://127.0.0.1:1420";
const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;

// Filled in by buildDemo(); macOS resolves /tmp to /private/tmp, so these are the real paths.
let demo = DEMO_DIR;
let acme = "";
let storefront = "";
let paymentsApi = "";
let designSystem = "";
let notes = "";
let shopApp = "";
let mediaSite = "";
let brandKit = "";

const appVersion =
  /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(PROJECT, "src-tauri/Cargo.toml"), "utf8"))?.[1] ?? "0.0.0";

// ---------------------------------------------------------------------------------------------
// Scenario: what the page answers itself

interface Scenario {
  /** get_launch_mode; defaults to the acme workspace. */
  launch?: Record<string, unknown>;
  /** settings.json contents (preferences). */
  settings?: Record<string, unknown>;
  /** state.json contents, merged over the defaults below. */
  state?: Record<string, unknown>;
  colorScheme?: "light" | "dark";
  /** What the GitHub releases API answers. */
  releases?: unknown[];
  /** What a folder picker returns. */
  dialogFolder?: string | null;
  /** Answer load_mergetool with a real load_conflict of this file. */
  mergetool?: { repoPath: string; conflictPath: string };
  /** Let Playwright control timers, for the delayed update check. */
  clock?: boolean;
  /** Hold a fetch this long before running it, to catch the busy state. */
  holdFetchMs?: number;
  /** Hold the first call of these commands this long (ms) before running it. */
  hold?: Record<string, number>;
  /** A smaller window, for shots of one panel that would otherwise be mostly empty. */
  viewport?: { width: number; height: number };
  /** load_config("state") fails with this message, like a state.json with a typo. */
  stateLoadError?: string;
  /** The GitHub account and gh CLI the page reports; signed out with no gh by default. */
  github?: { account?: Record<string, unknown> | null; cli?: { installed: boolean; signedIn: boolean } };
  /** The MCP server status the page reports (merged over "off"). */
  mcp?: Record<string, unknown>;
  /** Recent MCP calls. */
  mcpActivity?: unknown[];
  /** lfs_status answered in the page instead of running git lfs. */
  lfsStatus?: Record<string, unknown>;
  /** localStorage entries set before the app starts. */
  localStorage?: Record<string, string>;
  /** Start the shot without waiting for the workspace, to catch what shows while it opens. */
  noWait?: boolean;
  /** Report the demo's stand-in Claude Code as the one installed agent (see writeDemoAgent). */
  agents?: boolean;
  /** Sample AI usage for the status bar (your own sign-ins are never used). */
  aiUsage?: boolean;
  /** Demo sizes for the running terminals, oldest first: the stand-ins themselves use almost nothing. */
  terminalMemory?: number[];
}

interface PageConfig {
  launch: Record<string, unknown>;
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  dialogFolder: string | null;
  mergetool: { repoPath: string; conflictPath: string } | null;
  hold: Record<string, number>;
  stateLoadError: string | null;
  allowedRoot: string;
  github: { account: Record<string, unknown> | null; cli: { installed: boolean; signedIn: boolean } };
  mcp: Record<string, unknown>;
  mcpActivity: unknown[];
  lfsStatus: Record<string, unknown> | null;
  localStorage: Record<string, string>;
  nodeVersions: unknown[];
  shells: unknown[];
  agentPrograms: unknown[];
  aiUsage: unknown[];
  terminalMemory: number[];
}

/** A made-up token: the real one lives in ~/.nibtree/mcp.json. */
const FAKE_MCP_TOKEN = "3f9c2a7e1b4d8f6a0c5e9b2d7a4f1c8e6b3d0a9f5c2e7b4a1d8f6c3e0b9a5d2f";

function mcpOffStatus(): Record<string, unknown> {
  return {
    enabled: false,
    cliEnabled: false,
    running: false,
    port: 48731,
    url: "http://127.0.0.1:48731/mcp",
    token: FAKE_MCP_TOKEN,
    error: null,
    cliCommand: "/Applications/Nibtree.app/Contents/MacOS/nibtree cli",
    cliInstalledPath: null,
    cliOnPath: true,
  };
}

/** Node installs the Scripts panel offers; the real list would come from your own nvm and Homebrew. */
function cannedNodeVersions(): unknown[] {
  return [
    { version: "22.11.0", binDir: "/opt/demo-node/22.11.0/bin", manager: "nvm" },
    { version: "20.18.0", binDir: "/opt/demo-node/20.18.0/bin", manager: "nvm" },
    { version: "18.20.6", binDir: "/opt/demo-node/18.20.6/bin", manager: "Homebrew" },
  ];
}

/** The same on every machine; terminal_spawn still starts the real shell at that path. */
function cannedShells(): unknown[] {
  const shell = (name: string, args: string[], isDefault: boolean) => ({
    id: `/bin/${name}`,
    name,
    path: `/bin/${name}`,
    args,
    isDefault,
  });
  return [shell("zsh", ["-l"], true), shell("bash", ["-l"], false), shell("sh", [], false), shell("dash", [], false)];
}

/**
 * A stand-in for Claude Code inside the demo folder, so shots of the AI panel never start a real agent. It sets
 * the terminal title like the real one: a rest mark, then a spinner while it works on what was typed.
 */
function writeDemoAgent(): string {
  const file = join(demo, ".agents", "claude");
  mkdirSync(dirname(file), { recursive: true });
  const script = [
    "#!/bin/bash",
    "printf '\\033]0;\u2733 Claude Code\\007'",
    "echo 'Claude Code (a stand-in for the screenshots)'",
    "echo",
    "printf '> '",
    "while IFS= read -r line; do",
    "  printf '\\033]0;\u280b %s\\007' \"$line\"",
    '  echo "Reading the code for: $line"',
    "  sleep 600",
    "done",
    "",
  ].join("\n");
  writeFileSync(file, script, { mode: 0o755 });
  return file;
}

/** Plausible usage for the status bar shots: Claude Code getting close to its weekly limit, Codex fresh. */
function cannedAiUsage(): unknown[] {
  const now = Date.now();
  return [
    {
      provider: "claude",
      status: "ok",
      session: { usedPercent: 42, windowMinutes: 300, resetsAt: now + 135 * 60_000 },
      weekly: { usedPercent: 83, windowMinutes: 10_080, resetsAt: now + 52 * 3_600_000 },
      modelWeekly: [
        { model: "Fable", window: { usedPercent: 57, windowMinutes: 10_080, resetsAt: now + 52 * 3_600_000 } },
      ],
      plan: "max",
      message: null,
    },
    {
      provider: "codex",
      status: "ok",
      session: { usedPercent: 12, windowMinutes: 300, resetsAt: now + 4 * 3_600_000 },
      weekly: { usedPercent: 31, windowMinutes: 10_080, resetsAt: now + 5 * 24 * 3_600_000 },
      modelWeekly: [],
      plan: "plus",
      message: null,
    },
  ];
}

function workspaceLaunch(): Record<string, unknown> {
  return { mode: "app", repoPath: acme };
}

function defaultState(): Record<string, unknown> {
  return {
    lastRunVersion: appVersion,
    // The acme workspace opens on storefront.
    activeRepos: { [acme]: storefront },
    explorerOpen: true,
    leftPanel: "changes",
    sidebarWidth: 300,
    explorerWidth: 250,
  };
}

function pageConfig(scenario: Scenario): PageConfig {
  const hold = { ...(scenario.hold ?? {}) };
  if (scenario.holdFetchMs) {
    hold.fetch_all = scenario.holdFetchMs;
  }
  return {
    launch: scenario.launch ?? workspaceLaunch(),
    settings: scenario.settings ?? {},
    state: { ...defaultState(), ...(scenario.state ?? {}) },
    dialogFolder: scenario.dialogFolder ?? null,
    mergetool: scenario.mergetool ?? null,
    hold,
    stateLoadError: scenario.stateLoadError ?? null,
    allowedRoot: demo,
    github: {
      account: scenario.github?.account ?? null,
      cli: scenario.github?.cli ?? { installed: false, signedIn: false },
    },
    mcp: { ...mcpOffStatus(), ...(scenario.mcp ?? {}) },
    mcpActivity: scenario.mcpActivity ?? [],
    lfsStatus: scenario.lfsStatus ?? null,
    localStorage: scenario.localStorage ?? {},
    nodeVersions: cannedNodeVersions(),
    shells: cannedShells(),
    agentPrograms: scenario.agents ? [{ program: "claude", path: writeDemoAgent() }] : [],
    aiUsage: scenario.aiUsage ? cannedAiUsage() : [],
    terminalMemory: scenario.terminalMemory ?? [],
  };
}

/** Runs in the page before the app: installs the overrides and a gate in front of Tauri's invoke. */
function installOverrides(config: PageConfig): void {
  type Handler = (args: unknown) => unknown;
  type Invoke = (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;
  const store: Record<string, unknown> = { settings: config.settings, state: config.state };
  // Vite serves a module edited since the dev server started as `path?t=...`, and a plain import of
  // the path would load a second copy with its own stores. __gmImport loads the copy the app uses.
  performance.setResourceTimingBufferSize(20000);
  (window as unknown as { __gmImport: (modulePath: string) => Promise<unknown> }).__gmImport = (modulePath: string) => {
    const loaded = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => new URL(name).pathname === modulePath);
    return import(loaded ?? modulePath);
  };
  const blocked = (cmd: string) => () => {
    throw { kind: "blocked", message: `screenshots.ts does not run ${cmd}` };
  };
  // Exact folder or below it: a bare prefix would also let a sibling like /tmp/nibtree-docs-x through.
  const inside = (value: string) =>
    value === config.allowedRoot || value.startsWith(`${config.allowedRoot.replace(/\/+$/, "")}/`);
  const unsaved = new Map<string, { tabPath: string; workspaceId: string; savedAt: number; text: string }>();
  let mcpStatus = { ...config.mcp };
  let memoryLog = { enabled: false, path: "/Users/you/.nibtree/logs/memory.log", intervalMs: 500, thresholdMb: 5 };
  const overrides: Record<string, Handler> = {
    load_config: (args) => {
      const { configName } = args as { configName: string };
      if (configName === "state" && config.stateLoadError) {
        // Shaped like the backend's AppError for a file that is not valid JSON.
        throw { kind: "invalid", message: config.stateLoadError };
      }
      return structuredClone(store[configName] ?? {});
    },
    save_config: (args) => {
      const { configName, value } = args as { configName: string; value: unknown };
      store[configName] = value;
      return null;
    },
    // Settings are written as patches; relayed, they would patch your own settings.json and
    // state.json with the demo (its folder became the last session and the only recent folder).
    update_config: (args) => {
      const { configName, patch } = args as {
        configName: string;
        patch: { set?: { path: string[]; value: unknown }[]; remove?: string[][] };
      };
      const root = (store[configName] ?? {}) as Record<string, unknown>;
      // The object holding the last key of `path`, made on the way for a set.
      const parentOf = (path: string[], make: boolean): Record<string, unknown> | null => {
        let node = root;
        for (const key of path.slice(0, -1)) {
          const next = node[key];
          if (typeof next !== "object" || next === null || Array.isArray(next)) {
            if (!make) {
              return null;
            }
            node[key] = {};
          }
          node = node[key] as Record<string, unknown>;
        }
        return node;
      };
      for (const entry of patch.set ?? []) {
        const parent = parentOf(entry.path, true);
        if (parent && entry.path.length > 0) {
          parent[entry.path[entry.path.length - 1]] = structuredClone(entry.value);
        }
      }
      for (const path of patch.remove ?? []) {
        const parent = parentOf(path, false);
        if (parent && path.length > 0) {
          delete parent[path[path.length - 1]];
        }
      }
      store[configName] = root;
      return null;
    },
    config_dir: () => "/Users/you/.nibtree",
    get_launch_mode: () => config.launch,
    save_mergetool: () => null,
    cancel_mergetool: () => null,
    "plugin:dialog|open": () => config.dialogFolder,
    "plugin:path|resolve_directory": () => "/Users/you",
    read_clipboard_text: () => "",
    // Your own Node installs and shells stay out of the pictures.
    list_node_versions: () => structuredClone(config.nodeVersions),
    terminal_shells: () => structuredClone(config.shells),
    // Your own AI agents never run in a shot: only the demo's stand-in, when the scenario asks for it.
    find_agent_programs: () => structuredClone(config.agentPrograms),
    // Your own Claude Code sign-in and Codex logs stay out of the pictures.
    ai_usage: () => structuredClone(config.aiUsage),
    // The demo's real terminals, with demo sizes when the scenario gives them.
    terminal_memory: async () => {
      type Measured = { terminalId: number; bytes: number; processes: number };
      const measured = ((await internals.invoke("terminal_memory__real")) as Measured[]).sort(
        (left, right) => left.terminalId - right.terminalId,
      );
      return measured.map((row, index) => ({ ...row, bytes: config.terminalMemory[index] ?? row.bytes }));
    },
    // GitHub: never the real keychain, gh or ~/.nibtree/github.json.
    github_account: () => structuredClone(config.github.account),
    github_cli_status: () => structuredClone(config.github.cli),
    github_sign_in_with_token: blocked("github_sign_in_with_token"),
    github_sign_in_with_cli: blocked("github_sign_in_with_cli"),
    github_sign_out: blocked("github_sign_out"),
    github_share_project: blocked("github_share_project"),
    github_repository: blocked("github_repository"),
    github_sync_fork: blocked("github_sync_fork"),
    github_create_gist: blocked("github_create_gist"),
    // MCP: the real server would open a port and write ~/.nibtree/mcp.json.
    mcp_configure: (args) => {
      const { enabled, cliEnabled } = args as { enabled: boolean; cliEnabled: boolean };
      mcpStatus = { ...mcpStatus, enabled, cliEnabled, running: enabled || cliEnabled };
      return structuredClone(mcpStatus);
    },
    mcp_status: () => structuredClone(mcpStatus),
    mcp_tools: async () => {
      // The real list, with every tool at its default rather than your own choices.
      const tools = (await internals.invoke("mcp_tools__real")) as { destructive: boolean; enabled: boolean }[];
      return tools.map((tool) => ({ ...tool, enabled: !tool.destructive }));
    },
    mcp_activity: () => structuredClone(config.mcpActivity),
    mcp_register_ui_tools: () => null,
    // The real command: it also tells the preview scheme which (demo) folders it may serve.
    mcp_set_workspace: (args) => internals.invoke("mcp_set_workspace__real", args),
    mcp_ui_respond: () => null,
    mcp_regenerate_token: () => structuredClone(mcpStatus),
    cli_install: blocked("cli_install"),
    cli_uninstall: blocked("cli_uninstall"),
    // The memory log would write into ~/.nibtree/logs.
    memory_log_configure: (args) => {
      const { enabled, intervalMs, thresholdMb } = args as {
        enabled: boolean;
        intervalMs: number;
        thresholdMb: number;
      };
      memoryLog = { ...memoryLog, enabled, intervalMs, thresholdMb };
      return structuredClone(memoryLog);
    },
    memory_log_event: () => null,
    lfs_install: blocked("lfs_install"),
    // The window commands belong to the app window: asked there, they would hand the page that
    // window's own folders (refused below, so every shot fell back to the welcome screen) and
    // retitle it. The page is a window of its own that opens the scenario's launch.
    window_startup: () => ({ kind: "default", label: "main" }),
    window_set_workspace: () => null,
    window_focus_owner: () => null,
    window_open: blocked("window_open"),
    window_close: blocked("window_close"),
    // Remember unsaved changes would write into ~/.nibtree/unsaved: kept in the page instead.
    unsaved_write: (args) => {
      const bytes = args as Uint8Array;
      const split = bytes.indexOf(10);
      const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(0, split))) as {
        tabPath: string;
        workspaceId: string;
      };
      unsaved.set(meta.tabPath, {
        ...meta,
        savedAt: Date.now(),
        text: new TextDecoder().decode(bytes.subarray(split + 1)),
      });
      return null;
    },
    unsaved_read: (args) => structuredClone(unsaved.get((args as { tabPath: string }).tabPath) ?? null),
    unsaved_remove: (args) => {
      for (const tabPath of (args as { tabPaths: string[] }).tabPaths) {
        unsaved.delete(tabPath);
      }
      return null;
    },
    unsaved_list: () => [...unsaved.values()].map(({ text: _text, ...meta }) => meta),
    // Only the demo's commands: the app window may run its own.
    git_console_entries: async () => {
      const entries = (await internals.invoke("git_console_entries__real")) as { repoPath: string }[];
      return entries.filter((entry) => inside(entry.repoPath));
    },
  };
  if (config.lfsStatus) {
    const lfsStatus = config.lfsStatus;
    overrides.lfs_status = () => structuredClone(lfsStatus);
  }
  const target = config.mergetool;
  if (target) {
    // A real mergetool launch labels the panes from git's LOCAL and REMOTE files, not the branches.
    overrides.load_mergetool = async (args) => ({
      ...((await internals.invoke("load_conflict", {
        repoPath: target.repoPath,
        conflictPath: target.conflictPath,
        ignoreWhitespace: (args as { ignoreWhitespace?: boolean }).ignoreWhitespace ?? false,
      })) as Record<string, unknown>),
      oursLabel: "Local (yours)",
      theirsLabel: "Remote (theirs)",
    });
  }
  for (const [cmd, holdMs] of Object.entries(config.hold)) {
    // Holds the first call in the page for a moment so a busy or opening state can be photographed;
    // the command itself still runs for real afterwards.
    overrides[cmd] = async (args) => {
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      delete overrides[cmd];
      return internals.invoke(cmd, args);
    };
  }
  // The native menu bar belongs to the app window: the page's menu is built against fakes, so it
  // never replaces the real one. Resource ids are fakes too, so freeing them must not reach the app.
  let nextMenuRid = 1_000_000;
  const prefixOverrides: [string, (cmd: string) => unknown][] = [
    [
      "plugin:menu|",
      (cmd) => {
        if (cmd === "plugin:menu|new" || cmd === "plugin:menu|create_default") {
          const rid = nextMenuRid++;
          return [rid, `menu-${rid}`];
        }
        if (cmd === "plugin:menu|items") {
          return [];
        }
        if (cmd === "plugin:menu|text") {
          return "";
        }
        if (cmd === "plugin:menu|is_enabled") {
          return true;
        }
        if (cmd === "plugin:menu|is_checked") {
          return false;
        }
        return null;
      },
    ],
    ["plugin:resources|", () => null],
  ];
  const shots = {
    pending: 0,
    blocked: [] as string[],
    inflight: {} as Record<string, number>,
    calls: [] as string[],
    slow: [] as string[],
  };
  const blockedPrefixes = ["plugin:dialog|", "plugin:opener|", "plugin:window|", "plugin:webview|", "plugin:process|"];
  let inner: Invoke | null = null;

  async function gate(cmd: string, args?: unknown, options?: unknown): Promise<unknown> {
    shots.calls.push(cmd);
    // Overrides call the real command under a "__real" alias.
    const realCmd = cmd.endsWith("__real") ? cmd.slice(0, -"__real".length) : cmd;
    if (realCmd === cmd && cmd in overrides) {
      return overrides[cmd](args);
    }
    const prefixed = prefixOverrides.find(([prefix]) => cmd.startsWith(prefix));
    if (prefixed) {
      return prefixed[1](cmd);
    }
    if (blockedPrefixes.some((prefix) => cmd.startsWith(prefix))) {
      shots.blocked.push(cmd);
      return null;
    }
    if (cmd === "plugin:event|emit" && droppedEvent(args)) {
      return null;
    }
    // Never let a command reach a real repository: every path argument must be in the demo.
    const outside = pathArguments(args).find((value) => value.startsWith("/") && !inside(value));
    if (outside) {
      shots.blocked.push(`${cmd} ${outside}`);
      throw { kind: "blocked", message: `screenshots.ts refused ${cmd} on ${outside}` };
    }
    if (!inner) {
      throw { kind: "blocked", message: "IPC is not ready" };
    }
    shots.pending++;
    shots.inflight[realCmd] = (shots.inflight[realCmd] ?? 0) + 1;
    const started = Date.now();
    try {
      return await inner(realCmd, args, options);
    } finally {
      shots.pending--;
      shots.inflight[realCmd]--;
      if (Date.now() - started > 3000) {
        shots.slow.push(`${realCmd} ${Date.now() - started}ms at ${started % 100000}`);
      }
    }
  }

  /** A relayed backend event about something outside the demo, like a git command of the app window. */
  function droppedEvent(args: unknown): boolean {
    const { event, payload } = (args ?? {}) as { event?: string; payload?: { repoPath?: unknown } };
    return event === "git-command" && typeof payload?.repoPath === "string" && !inside(payload.repoPath);
  }

  /** Values of arguments named like paths (repoPath, filePaths, workspaceRoot, cwd, ...), not file contents. */
  function pathArguments(args: unknown): string[] {
    const found: string[] = [];
    if (!args || typeof args !== "object") {
      return found;
    }
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      if (!/(path|root|dir|folder|cwd)s?$/i.test(key)) {
        continue;
      }
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === "string") {
          found.push(item);
        }
      }
    }
    return found;
  }

  const internals = {} as { invoke: Invoke };
  Object.defineProperty(internals, "invoke", {
    configurable: true,
    enumerable: true,
    get: () => gate,
    set: (value: Invoke) => {
      inner = value;
    },
  });
  for (const [key, value] of Object.entries(config.localStorage)) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A page without storage just shows the defaults.
    }
  }
  const page = window as unknown as Record<string, unknown>;
  page.__GM_SHOTS__ = shots;
  page.__TAURI_INTERNALS__ = internals;
}

// ---------------------------------------------------------------------------------------------
// Demo data

function buildDemo(): void {
  rmSync(DEMO_DIR, { recursive: true, force: true });
  execFileSync("bash", [join(PROJECT, "scripts/make-docs-demo.sh"), DEMO_DIR], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  demo = realpathSync(DEMO_DIR);
  acme = join(demo, "acme");
  storefront = join(acme, "storefront");
  paymentsApi = join(acme, "payments-api");
  notes = join(acme, "notes");
  designSystem = join(demo, "design-system");
  shopApp = join(demo, "extras/shop-app");
  mediaSite = join(demo, "extras/media-site");
  brandKit = join(demo, "extras/brand-kit");
}

/**
 * The page has no gmpreview scheme (only the app window does), so its URLs, in the form
 * src/lib/views/files/previewSource.ts builds without Tauri, are answered here from the demo.
 */
function previewResponse(url: string): { status: number; body?: Buffer; contentType?: string } {
  const [kind, ...parts] = new URL(url).pathname
    .split("/")
    .slice(1)
    .map((part) => decodeURIComponent(part));
  const inDemo = (path: string) => path.startsWith(`${demo}/`) && !path.split("/").includes("..");
  const filePath = kind === "worktree" ? parts[0] : parts[2];
  const contentType = previewOf(filePath ?? "")?.mime;
  if (!contentType || filePath.split("/").includes("..")) {
    return { status: 403 };
  }
  try {
    if (kind === "worktree" && parts.length === 1 && inDemo(filePath)) {
      return { status: 200, body: readFileSync(filePath), contentType };
    }
    if (kind === "revision" && parts.length === 3 && inDemo(parts[0])) {
      const [repoRoot, revision, relativePath] = parts;
      const spec = revision === "index" ? `:0:${relativePath}` : `${revision}:${relativePath}`;
      const body = execFileSync("git", ["-C", repoRoot, "show", spec], {
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
      return { status: 200, body, contentType };
    }
  } catch {
    return { status: 404 };
  }
  return { status: 403 };
}

function githubReleases(): unknown[] {
  const release = (version: string, prerelease: boolean, daysAgo: number, body: string) => ({
    tag_name: `v${version}`,
    name: `Nibtree ${version}`,
    body,
    html_url: `https://github.com/shibbirweb/nibtree/releases/tag/v${version}`,
    published_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    prerelease,
    draft: false,
    assets: [
      {
        name: `Git.Manager_${version}_aarch64.dmg`,
        browser_download_url: `https://github.com/shibbirweb/nibtree/releases/download/v${version}/Git.Manager_${version}_aarch64.dmg`,
      },
    ],
  });
  return [
    release(
      "0.1.0",
      false,
      1,
      [
        "### Added",
        "",
        "- Stage single lines from the side-by-side diff, not only whole hunks.",
        "- The Log remembers its filter per repository.",
        "",
        "### Changed",
        "",
        "- The merge tool scrolls all three panes together more smoothly on long files.",
        "",
        "### Fixed",
        "",
        "- Blame no longer shows a stale author after you save a file.",
        "- Pushing a new branch sets its upstream the first time.",
      ].join("\n"),
    ),
    release(
      "0.1.0-beta.2",
      true,
      8,
      ["### Fixed", "", "- The Files panel keeps its scroll position when a repository refreshes."].join("\n"),
    ),
    release("0.1.0-beta.1", true, 20, "### Added\n\n- First beta."),
  ];
}

// ---------------------------------------------------------------------------------------------
// Page helpers

class Shot {
  constructor(
    readonly page: Page,
    readonly name: string,
    readonly viewport: { width: number; height: number },
  ) {}

  /** Waits until no relayed command is in flight for a moment, then for two frames. */
  async settle(quietMs = 350): Promise<void> {
    const deadline = Date.now() + 20000;
    let quietSince = Date.now();
    for (;;) {
      if (Date.now() >= deadline) {
        const inflight = await this.page.evaluate(
          () => (window as unknown as { __GM_SHOTS__: { inflight: Record<string, number> } }).__GM_SHOTS__.inflight,
        );
        const names = Object.entries(inflight)
          .filter((entry) => entry[1] > 0)
          .map((entry) => entry[0]);
        console.warn(`  ${this.name}: still waiting on ${names.join(", ")}`);
        const slow = await this.page.evaluate(
          () => (window as unknown as { __GM_SHOTS__: { slow: string[] } }).__GM_SHOTS__.slow,
        );
        console.warn(`  slow: ${slow.join(" | ")} now ${Date.now() % 100000}`);
        break;
      }
      const pending = await this.page.evaluate(
        () => (window as unknown as { __GM_SHOTS__: { pending: number } }).__GM_SHOTS__.pending,
      );
      if (pending > 0) {
        quietSince = Date.now();
      } else if (Date.now() - quietSince >= quietMs) {
        break;
      }
      await this.page.waitForTimeout(50);
    }
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }

  /** A row of the Files panel, by its absolute path (the row's title). */
  fileRow(absolutePath: string): Locator {
    return this.page.locator(`aside[aria-label=Right\\ panel] [role="treeitem"][title="${absolutePath}"]`);
  }

  /** Expands folders in the Files panel, top down. */
  async expand(...absolutePaths: string[]): Promise<void> {
    for (const absolutePath of absolutePaths) {
      const row = this.fileRow(absolutePath);
      await row.waitFor();
      if ((await row.getAttribute("aria-expanded")) === "false") {
        await row.click();
        await this.settle();
      }
    }
  }

  /** Opens a file from the Files panel: double-click keeps it, a single click previews it. */
  async openFile(absolutePath: string, options: { preview?: boolean } = {}): Promise<void> {
    // Shots that hide the Files panel open the file the way the panel would.
    if (!(await this.page.locator("aside[aria-label=Right\\ panel]").isVisible())) {
      await this.page.evaluate(
        `(async () => { const { repoStore } = await window.__gmImport("/src/lib/stores/repo.svelte.ts"); await repoStore.openFile(${JSON.stringify(absolutePath)}, { pin: ${options.preview ? "false" : "true"} }); })()`,
      );
      await this.editorReady();
      return;
    }
    const root = absolutePath.startsWith(`${designSystem}/`) ? designSystem : acme;
    const segments = absolutePath.slice(root.length + 1).split("/");
    const folders = segments.slice(0, -1).map((_, index) => join(root, ...segments.slice(0, index + 1)));
    await this.expand(...folders);
    const row = this.fileRow(absolutePath);
    if (options.preview) {
      await row.click();
    } else {
      await row.dblclick();
    }
    await this.editorReady();
  }

  /** The visible editor has rendered its text. */
  async editorReady(): Promise<void> {
    // A Markdown file opened in preview mode shows the rich editor instead of CodeMirror.
    await this.page
      .locator(
        "[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-content .cm-line, [role=group][aria-label=Tab\\ content]:not([hidden]) .rich-markdown",
      )
      .filter({ visible: true })
      .first()
      .waitFor();
    await this.settle();
  }

  /** The visible file editor's line that contains this text. */
  editorLine(text: string): Locator {
    return this.page
      .locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-content .cm-line", { hasText: text })
      .first();
  }

  menu(): Locator {
    return this.page.locator('.menu[role="menu"]');
  }

  async closeMenu(): Promise<void> {
    if (await this.menu().isVisible()) {
      await this.page.keyboard.press("Escape");
      await this.menu().waitFor({ state: "hidden" });
    }
  }

  async activateRepo(repoName: string): Promise<void> {
    await this.page.locator('header button[title^="Active repository:"]').click();
    await this.menu()
      .getByRole("menuitem", { name: new RegExp(`^\\S*\\s*${repoName}\\b`) })
      .click();
    await this.settle();
  }

  async showLog(): Promise<void> {
    await this.page.getByRole("button", { name: "Log", exact: true }).click();
    await this.page.locator('[aria-label="Commits"]').waitFor();
    await this.settle();
  }

  /** Dismisses toasts that report success; any error toast fails the shot. */
  async clearToasts(): Promise<void> {
    const toasts = this.page.locator(".toasts .toast");
    const errors = await this.page.locator(".toasts .toast.error").allInnerTexts();
    if (errors.length > 0) {
      throw new Error(`${this.name}: error toast on screen: ${errors.join(" | ").replace(/\s+/g, " ")}`);
    }
    while ((await toasts.count()) > 0) {
      await toasts.first().getByRole("button", { name: "Dismiss" }).click();
    }
  }

  /** Union of the elements' boxes plus padding, kept inside the window. */
  async clipAround(
    targets: Locator[],
    padding: number | { top?: number; right?: number; bottom?: number; left?: number } = 0,
  ) {
    const pad =
      typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const target of targets) {
      const box = await target.boundingBox();
      if (!box) {
        throw new Error(`${this.name}: an element to clip is not visible`);
      }
      left = Math.min(left, box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width);
      bottom = Math.max(bottom, box.y + box.height);
    }
    left = Math.max(0, Math.floor(left - (pad.left ?? 0)));
    top = Math.max(0, Math.floor(top - (pad.top ?? 0)));
    right = Math.min(this.viewport.width, Math.ceil(right + (pad.right ?? 0)));
    bottom = Math.min(this.viewport.height, Math.ceil(bottom + (pad.bottom ?? 0)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /** The top of a panel, down to just below the lowest of `contents`. */
  async clipPanel(panel: Locator, contents: Locator[], paddingBottom = 16) {
    const box = await panel.boundingBox();
    if (!box) {
      throw new Error(`${this.name}: the panel is not visible`);
    }
    let bottom = box.y;
    for (const content of contents) {
      const contentBox = await content.boundingBox();
      if (!contentBox) {
        throw new Error(`${this.name}: an element to clip is not visible`);
      }
      bottom = Math.max(bottom, contentBox.y + contentBox.height);
    }
    const height = Math.min(box.height, Math.ceil(bottom + paddingBottom - box.y));
    return { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height };
  }

  /** Saves the window, a clip of it, or one element. */
  async save(
    target?: Locator | { x: number; y: number; width: number; height: number },
    options: { scale?: "css" | "device"; settle?: boolean } = {},
  ): Promise<void> {
    if (options.settle !== false) {
      await this.settle();
    }
    await this.clearToasts();
    const blocked = await this.page.evaluate(
      () => (window as unknown as { __GM_SHOTS__: { blocked: string[] } }).__GM_SHOTS__.blocked,
    );
    const unexpected = blocked.filter((entry) => !entry.startsWith("plugin:window|"));
    if (unexpected.length > 0) {
      console.warn(`  ${this.name}: blocked ${unexpected.join(", ")}`);
    }
    const path = join(OUT_DIR, `${this.name}.png`);
    const scale = options.scale ?? "device";
    if (target && "screenshot" in target) {
      await target.screenshot({ path, scale, animations: "disabled" });
    } else {
      await this.page.screenshot({ path, clip: target, scale, animations: "disabled" });
    }
  }
}

/** [[dd-]hh:]mm:ss from ps, in seconds. */
function elapsedSeconds(etime: string): number {
  const [days, clock] = etime.includes("-") ? etime.split("-") : ["0", etime];
  return clock.split(":").reduce((total, part) => total * 60 + Number(part), 0) + Number(days) * 86400;
}

/**
 * The pid of the newest dev build of the app. An older `bun tauri dev` window still running would also
 * connect to the dev server, so the page asks for this one by pid (see src/lib/dev/ipcBridge.ts).
 */
function appPid(): number | null {
  let listing = "";
  try {
    listing = execFileSync("ps", ["-axo", "pid=,etime=,command="], { encoding: "utf8" });
  } catch {
    return null;
  }
  const apps = listing
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null && /target\/debug\/nibtree$/.test(match[3]))
    .map((match) => ({ pid: Number(match[1]), elapsed: elapsedSeconds(match[2]) }))
    .sort((left, right) => left.elapsed - right.elapsed);
  return apps[0]?.pid ?? null;
}

let bridgePid: number | null = null;

async function openApp(
  browser: Browser,
  name: string,
  scenario: Scenario,
): Promise<{ context: BrowserContext; shot: Shot }> {
  const viewport = scenario.viewport ?? VIEWPORT;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme: scenario.colorScheme ?? "light",
  });
  const releases = scenario.releases ?? [];
  await context.route("https://api.github.com/**", (route) => route.fulfill({ json: releases }));
  await context.route("http://gmpreview.localhost/**", (route) =>
    route.fulfill(previewResponse(route.request().url())),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => console.warn(`  ${name}: page error: ${error.message}`));
  page.on("console", (message) => {
    if (process.env.GM_SHOTS_CONSOLE) {
      console.warn(`  console: ${message.text()}`);
    }
  });
  if (scenario.clock) {
    await page.clock.install();
  }
  await page.addInitScript(installOverrides, pageConfig(scenario));
  await page.goto(`${DEV_SERVER}/?ipc-bridge=${bridgePid ?? ""}`);
  const shot = new Shot(page, name, viewport);
  if (scenario.noWait) {
    return { context, shot };
  }
  const ready = page.locator(".shell, [role='region'][aria-label^='Merge '], [aria-label='Welcome sections']").first();
  try {
    await ready.waitFor({ timeout: 20000 });
  } catch {
    throw new Error("The app did not answer through the bridge. Is `GM_IPC_BRIDGE=1 bun tauri dev` running?");
  }
  await shot.settle(500);
  if (await page.locator("aside[aria-label=Right\\ panel]").isVisible()) {
    // The Files panel lists the workspace once the first directory listing is back.
    await page.locator('aside[aria-label=Right\\ panel] [role="treeitem"]').first().waitFor();
    await shot.settle();
  }
  return { context, shot };
}

// ---------------------------------------------------------------------------------------------
// Screenshots

interface ShotSpec {
  name: string;
  scenario?: () => Scenario;
  run: (shot: Shot) => Promise<void>;
}

const shots: ShotSpec[] = [];

function define(name: string, run: (shot: Shot) => Promise<void>, scenario?: () => Scenario): void {
  shots.push({ name, run, scenario });
}

const cartTs = () => join(storefront, "src/cart.ts");
const appTs = () => join(paymentsApi, "src/app.ts");

/** Collapses a repository in the Changes sidebar so the next one has room. */
async function collapseRepo(shot: Shot, repoName: string): Promise<void> {
  const toggle = repoHeader(shot, repoName);
  if ((await toggle.getAttribute("aria-expanded")) === "true") {
    await toggle.click();
    await shot.settle();
  }
}

/**
 * Puts the cursor at the start of the line with this text. Scrolls with the wheel and clicks by
 * coordinates: a CodeMirror line is as wide as the longest one, and Playwright would otherwise
 * scroll the editor sideways to reach the middle of it.
 */
async function clickLine(shot: Shot, text: string): Promise<void> {
  const scroller = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-scroller");
  const area = await scroller.boundingBox();
  if (!area) {
    throw new Error(`${shot.name}: no editor on screen`);
  }
  let box = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const line = shot.editorLine(text);
    if ((await line.count()) > 0) {
      box = await line.boundingBox();
      if (box && box.y >= area.y + 24 && box.y + box.height <= area.y + area.height - 60) {
        break;
      }
    }
    await shot.page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await shot.page.mouse.wheel(0, box && box.y < area.y + 24 ? -200 : 200);
    await shot.settle(150);
    box = null;
  }
  if (!box) {
    throw new Error(`${shot.name}: line "${text}" not found`);
  }
  await shot.page.mouse.click(box.x + 3, box.y + box.height / 2);
  await shot.settle();
}

/** The everyday window: storefront's changes, cart.ts open with the cursor on a changed line. */
async function overview(shot: Shot): Promise<void> {
  await collapseRepo(shot, "payments-api");
  await shot.openFile(cartTs());
  await clickLine(shot, "setQuantity(productId");
}

/** The Log gets the whole width: sidebar and Files panel hidden. */
function logScenario(): Scenario {
  return { state: { leftPanel: null, explorerOpen: false } };
}

function branchesScenario(): Scenario {
  return { state: { sidebarWidth: 340 } };
}

async function openBranches(shot: Shot): Promise<void> {
  await shot.page.getByRole("button", { name: "Branches and Stashes" }).click();
  await shot.page.getByRole("tree", { name: "Branches, tags and stashes" }).waitFor();
  await shot.settle();
}

function sidebarRow(shot: Shot, text: string | RegExp): Locator {
  return shot.page
    .getByRole("tree", { name: "Branches, tags and stashes" })
    .getByRole("treeitem")
    .filter({ hasText: text })
    .first();
}

function commitRow(shot: Shot, summary: string): Locator {
  return shot.page.locator('[aria-label="Commits"] [role="option"]', { hasText: summary }).first();
}

async function openSettings(shot: Shot, section: string): Promise<Locator> {
  await shot.page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = shot.page.getByRole("dialog");
  await dialog.waitFor();
  await dialog
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: section, exact: true })
    .click();
  await shot.settle();
  return dialog;
}

async function openConflictsDialog(shot: Shot): Promise<Locator> {
  await shot.activateRepo("payments-api");
  await shot.page.getByRole("button", { name: "Resolve Conflicts...", exact: true }).click();
  const dialog = shot.page.getByRole("dialog");
  await dialog.locator(".row.item").first().waitFor();
  await shot.settle();
  return dialog;
}

async function openMergeTool(shot: Shot): Promise<void> {
  const dialog = await openConflictsDialog(shot);
  await dialog.locator(".row.item", { hasText: "app.ts" }).first().click();
  await dialog.getByRole("button", { name: "Merge...", exact: true }).click();
  await shot.page.locator(".cm-editor").nth(2).waitFor();
  await shot.settle(600);
}

define(
  "welcome",
  async (shot) => {
    // Close the folder like a user would; the Welcome screen then lists what was opened before.
    await shot.page.locator('header button[aria-haspopup="menu"]').first().click();
    await shot.menu().getByRole("menuitem", { name: "Close Folder" }).click();
    await shot.page.getByRole("navigation", { name: "Welcome sections" }).waitFor();
    await shot.save();
  },
  () => ({
    state: {
      recentFolders: [designSystem, storefront, paymentsApi],
      recentWorkspaces: [[acme, designSystem]],
    },
  }),
);

define("window-overview", async (shot) => {
  await overview(shot);
  await shot.save();
});

define(
  "workspace-folders",
  async (shot) => {
    await shot.page.getByRole("button", { name: "Add folder to workspace" }).click();
    await shot.fileRow(designSystem).waitFor();
    await shot.settle();
    await shot.expand(join(designSystem, "tokens"));
    await shot.page.mouse.move(640, 400);
    const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
    await shot.save(await shot.clipPanel(explorer, [explorer.locator('[role="treeitem"]').last()], 24));
  },
  () => ({ dialogFolder: designSystem }),
);

define("repository-switcher", async (shot) => {
  // The menu opens where the pill is clicked; click near its bottom edge so the pill stays visible.
  const pill = shot.page.locator('header button[title^="Active repository:"]');
  const pillBox = await pill.boundingBox();
  await pill.click({ position: { x: 12, y: (pillBox?.height ?? 28) - 3 } });
  await shot.menu().waitFor();
  await shot.page.mouse.move(640, 600);
  await shot.save(
    await shot.clipAround([shot.page.locator("header .left"), shot.menu()], { top: 0, left: 0, right: 40, bottom: 24 }),
  );
});

define("init-repository", async (shot) => {
  await shot.fileRow(notes).click({ button: "right" });
  await shot.menu().waitFor();
  const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
  const panel = await shot.clipPanel(explorer, [shot.menu()], 24);
  const across = await shot.clipAround([explorer, shot.menu()], { right: 12 });
  await shot.save({ x: across.x, width: across.width, y: panel.y, height: panel.height });
});

define("files-panel", async (shot) => {
  await shot.expand(storefront, join(storefront, "src"));
  await shot.page.mouse.move(640, 400);
  const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
  await shot.save(await shot.clipPanel(explorer, [explorer.locator('[role="treeitem"]').last()], 24));
});

define(
  "file-icons",
  async (shot) => {
    await shot.expand(storefront, join(storefront, "src"));
    await shot.page.locator('aside[aria-label=Right\\ panel] [role="treeitem"] img').first().waitFor();
    await shot.page.mouse.move(640, 400);
    const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
    await shot.save(await shot.clipPanel(explorer, [explorer.locator('[role="treeitem"]').last()], 24));
  },
  () => ({ settings: { fileIcons: "material" } }),
);

define("files-context-menu", async (shot) => {
  await shot.expand(storefront, join(storefront, "src"));
  await shot.fileRow(cartTs()).click({ button: "right" });
  await shot.menu().waitFor();
  const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
  const panel = await shot.clipPanel(explorer, [shot.menu(), explorer.locator('[role="treeitem"]').last()], 24);
  const across = await shot.clipAround([explorer, shot.menu()], { right: 12 });
  await shot.save({ x: across.x, width: across.width, y: panel.y, height: panel.height });
});

// The same menu, showing the file operations (New File... to Move to Trash) with their keys.
define("file-ops-menu", async (shot) => {
  await shot.expand(storefront, join(storefront, "src"));
  await shot.fileRow(cartTs()).click({ button: "right" });
  await shot.menu().waitFor();
  await shot
    .menu()
    .getByRole("menuitem", { name: /^Rename\.\.\./ })
    .hover();
  const explorer = shot.page.locator("aside[aria-label=Right\\ panel]");
  const panel = await shot.clipPanel(explorer, [shot.menu(), explorer.locator('[role="treeitem"]').last()], 24);
  const across = await shot.clipAround([explorer, shot.menu()], { right: 12 });
  await shot.save({ x: across.x, width: across.width, y: panel.y, height: panel.height });
});

define("file-ops-rename", async (shot) => {
  await shot.expand(storefront, join(storefront, "src"));
  await shot.fileRow(cartTs()).click({ button: "right" });
  await shot
    .menu()
    .getByRole("menuitem", { name: /^Rename\.\.\./ })
    .click();
  const dialog = shot.page.getByRole("dialog", { name: "Rename File" });
  await dialog.waitFor();
  // The name is preselected without its extension ("cart" of cart.ts).
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
  // Leave the demo as it was.
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
});

define("editor-tabs", async (shot) => {
  await shot.openFile(join(storefront, "README.md"));
  await shot.openFile(join(storefront, "src/catalog.ts"));
  await shot.openFile(cartTs());
  // A single click opens a preview tab, shown in italics until it is kept.
  await shot.openFile(join(storefront, "src/pricing.ts"), { preview: true });
  await shot.page.mouse.move(640, 700);
  const main = shot.page.locator("main.main");
  const box = await main.boundingBox();
  if (!box) {
    throw new Error("editor-tabs: no editor area");
  }
  await shot.save({ x: box.x, y: box.y, width: box.width, height: 330 });
});

/** Opens enough files to fill or overflow the tab strip, in this order. */
async function openManyTabs(shot: Shot): Promise<void> {
  for (const file of [
    "README.md",
    "package.json",
    "src/index.ts",
    "src/catalog.ts",
    "src/pricing.ts",
    "src/shipping.ts",
    "src/checkout.ts",
  ]) {
    await shot.openFile(join(storefront, file));
  }
  await shot.openFile(cartTs());
}

/** Pins a tab from its right-click menu. */
async function pinTabNamed(shot: Shot, fileName: string): Promise<void> {
  await shot.page.locator(`.tab-strip .tab[data-tab-id$="/${fileName}"]`).first().click({ button: "right" });
  await shot.menu().getByRole("menuitem", { name: "Pin Tab" }).click();
}

// Two pinned tabs at the front of the strip, each with its pin button.
define("tabs-pinned", async (shot) => {
  await openManyTabs(shot);
  await pinTabNamed(shot, "catalog.ts");
  await pinTabNamed(shot, "pricing.ts");
  await shot.page.mouse.move(640, 700);
  await shot.save(await shot.clipAround([shot.page.locator(".tab-strip").first()], { bottom: 60 }));
});

// Settings > Editor > Wrap tabs: a narrow window shows the tabs on two rows.
define(
  "tabs-wrapped",
  async (shot) => {
    await openManyTabs(shot);
    await shot.page.mouse.move(5, 690);
    await shot.save(await shot.clipAround([shot.page.locator(".tab-strip").first()], { bottom: 60 }));
  },
  () => ({ settings: { wrapTabs: true }, viewport: { width: 900, height: 700 } }),
);

// Settings > Editor > Tab limit > Single tab title: in single tab mode, one open file shows its name centered above the code.
define(
  "single-tab-title",
  async (shot) => {
    await shot.openFile(cartTs());
    await shot.page.mouse.move(5, 690);
    await shot.save(await shot.clipAround([shot.page.locator(".tab-strip.single").first()], { bottom: 60 }));
  },
  () => ({ settings: { tabLimit: 1 } }),
);

// Window > Split Right, then Split Down: cart.ts on the left, pricing.ts above checkout.ts on the right.
define("split-editor-grid", async (shot) => {
  await shot.openFile(cartTs());
  await shot.openFile(join(storefront, "src/pricing.ts"));
  await menuAction(shot, "window.splitRight");
  await shot.openFile(join(storefront, "src/checkout.ts"));
  await menuAction(shot, "window.splitDown");
  const groups = shot.page.locator('section[aria-label^="Editor"]');
  await groups.nth(1).locator('.tab[data-tab-id$="/pricing.ts"]').click();
  await groups.nth(0).locator('.tab[data-tab-id$="/cart.ts"]').click();
  await shot.page.mouse.move(640, 790);
  await shot.save();
});

define(
  "unsaved-changes-close",
  async (shot) => {
    await shot.openFile(cartTs());
    await clickLine(shot, "setQuantity(productId");
    await shot.page.keyboard.type("// Quantities below one remove the line.\n");
    await shot.page.locator('[role=group][aria-label=Tab\\ content]:not([hidden]) [title="Unsaved changes"]').waitFor();
    await shot.page.locator('header button[aria-haspopup="menu"]').first().click();
    await shot.menu().getByRole("menuitem", { name: "Close Folder" }).click();
    const dialog = shot.page.getByRole("dialog", { name: "Unsaved Changes" });
    await dialog.waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
    // Keep the edit: the folder stays open with the tab still unsaved.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await shot.page.locator('[role=group][aria-label=Tab\\ content]:not([hidden]) [title="Unsaved changes"]').waitFor();
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define(
  "editor-change-markers",
  async (shot) => {
    await shot.openFile(cartTs());
    await clickLine(shot, "useDiscount(code");
    await shot.save(shot.page.locator("main.main"));
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define(
  "changes-sidebar",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    await shot.page.mouse.move(640, 300);
    await shot.save(shot.page.locator("aside[aria-label=Left\\ panel]"));
  },
  () => ({ viewport: { width: 1280, height: 560 }, state: { sidebarWidth: 360 } }),
);

define(
  "commit-box",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    const message = shot.page.getByRole("textbox", { name: "Commit message" });
    await message.click();
    await shot.page.keyboard.type(
      "Cart: set line quantities\n\nZero removes the line, and totals never go below zero.",
    );
    await shot.save(commitBox(shot));
  },
  () => ({ state: { sidebarWidth: 360 } }),
);

// Settings > Git > Commit box > Per repository: a message box at the top of each repository.
define(
  "commit-box-per-repo",
  async (shot) => {
    // payments-api's long file lists fold away, so both repositories and their boxes fit.
    const payments = shot.page.getByRole("group", { name: "payments-api", exact: true });
    for (const group of ["Conflicts", "Staged", "Changes"]) {
      await payments.getByRole("region", { name: group, exact: true }).getByRole("button").first().click();
    }
    const box = shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("textbox", { name: "Commit message" });
    await box.click();
    await shot.page.keyboard.type("Cart: set line quantities");
    await shot.page.mouse.move(640, 300);
    await shot.save(shot.page.locator("aside[aria-label=Left\\ panel]"));
  },
  () => ({
    viewport: { width: 1280, height: 720 },
    settings: { commitBoxLayout: "perRepo" },
    state: { sidebarWidth: 360 },
  }),
);

// A remote that wants a login: git asks through askpass, and the app shows the sign-in dialog.
define("askpass-sign-in", async (shot) => {
  // Answers every request with "401, log in", like a private repository over HTTPS.
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Git"' } }),
  });
  try {
    // A retry finds the remote of the first try, with an older port.
    try {
      execFileSync("git", ["-C", storefront, "remote", "remove", "private"], { stdio: "ignore" });
    } catch {
      // Not there yet.
    }
    await invokeApp(shot, "add_remote", {
      repoPath: storefront,
      remoteName: "private",
      fetchUrl: `http://127.0.0.1:${server.port}/acme/storefront.git`,
      pushUrl: null,
    });
    // Fetching every remote reaches the private one, which asks; the call ends once the dialog is cancelled.
    const fetching = invokeApp(shot, "fetch_all", { repoPath: storefront }).catch(() => null);
    const dialog = shot.page.getByRole("dialog", { name: /^Sign in to 127\.0\.0\.1/ });
    await dialog.waitFor();
    await dialog.getByLabel("Username").fill("octocat");
    // Exact, or it also finds the "Show password" button.
    await dialog.getByLabel("Password", { exact: true }).fill("ghp_example_token");
    await shot.save(dialog);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await fetching;
  } finally {
    server.stop(true);
  }
});

define("diff-view", async (shot) => {
  await collapseRepo(shot, "payments-api");
  // More room for the two sides.
  await shot.page.getByRole("button", { name: "Hide files" }).click();
  await shot.page
    .getByRole("group", { name: "storefront", exact: true })
    .getByRole("region", { name: "Changes" })
    .getByText("cart.ts")
    .click();
  await shot.page.locator("[aria-label='Diff'] .cm-mergeView, [aria-label='Diff'] .cm-merge-a").first().waitFor();
  await shot.settle(500);
  // Hovering a changed block shows its stage button more clearly.
  await shot.page.locator("[aria-label='Diff'] [title='Stage this change']").first().hover();
  await shot.save();
});

define("operation-banner", async (shot) => {
  await shot.activateRepo("payments-api");
  const banner = shot.page.getByRole("button", { name: "Abort", exact: true });
  await banner.waitFor();
  await shot.page.mouse.move(640, 500);
  await shot.save(
    await shot.clipAround([shot.page.locator("header.header"), shot.page.locator(".shell > .notice.banner")]),
  );
});

define("conflicts-dialog", async (shot) => {
  const dialog = await openConflictsDialog(shot);
  await dialog.locator(".row.item", { hasText: "app.ts" }).first().click();
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define(
  "inline-conflict-actions",
  async (shot) => {
    await shot.activateRepo("payments-api");
    await shot.openFile(appTs());
    // With the Files panel open the bar wraps, so the counter shows on its second line.
    await shot.page.locator(".cm-conflict-actions .cm-conflict-count").first().waitFor();
    await shot.settle();
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define("merge-tool", async (shot) => {
  await openMergeTool(shot);
  await shot.page.mouse.move(640, 790);
  await shot.save();
});

// Opens in Columns, takes the non-conflicting changes, then switches: the same editors move over with that work.
define("merge-tool-stacked", async (shot) => {
  await openMergeTool(shot);
  await shot.page.getByTitle("Apply all non-conflicting changes", { exact: true }).click();
  await shot.settle(300);
  await shot.page.getByRole("button", { name: "Stacked", exact: true }).click();
  await shot.page.locator(".cm-mc-lens").first().waitFor();
  await shot.settle(500);
  await shot.page.mouse.move(640, 790);
  await shot.save();
});

define("merge-tool-resolved", async (shot) => {
  await openMergeTool(shot);
  await shot.page.getByTitle("Apply all non-conflicting changes", { exact: true }).click();
  await shot.settle(600);
  await shot.page.mouse.move(640, 790);
  await shot.save();
});

define("blame-inline", async (shot) => {
  await shot.openFile(cartTs());
  // Room for the whole annotation.
  await shot.page.getByRole("button", { name: "Hide files" }).click();
  await shot.settle();
  await clickLine(shot, "useDiscount(code");
  const line = shot.editorLine("useDiscount(code");
  await line.locator(".cm-inline-blame").waitFor();
  const editor = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-editor");
  const lineBox = await line.boundingBox();
  const editorBox = await editor.boundingBox();
  if (!lineBox || !editorBox) {
    throw new Error("blame-inline: editor not visible");
  }
  const height = 240;
  const top = Math.max(editorBox.y, Math.min(lineBox.y - 110, editorBox.y + editorBox.height - height));
  await shot.save({ x: editorBox.x, y: top, width: editorBox.width, height });
});

define(
  "blame-gutter",
  async (shot) => {
    await shot.openFile(cartTs());
    await shot.page.getByRole("toolbar", { name: "File actions" }).getByRole("button", { name: "Blame" }).click();
    await shot.page
      .locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-blame-gutter .cm-blame-cell", {
        hasText: "Maya Chen",
      })
      .first()
      .waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define(
  "log-graph",
  async (shot) => {
    await shot.showLog();
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  logScenario,
);

define(
  "commit-details",
  async (shot) => {
    await shot.showLog();
    await commitRow(shot, "Cart: discount codes and totals").click();
    const log = shot.page.getByRole("region", { name: "Log", exact: true });
    const files = log.getByRole("listbox", { name: "Changed files" });
    await files.waitFor();
    await files.getByText("cart.ts").first().click();
    await log.locator(".cm-editor").first().waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  logScenario,
);

define(
  "merge-commit-files",
  async (shot) => {
    await shot.showLog();
    await commitRow(shot, "Merge branch 'feature/checkout'").click();
    const log = shot.page.getByRole("region", { name: "Log", exact: true });
    const diff = log.getByRole("region", { name: "Diff of catalog.ts against both parents" });
    await diff.locator(".cm-editor").nth(2).waitFor();
    await shot.settle(700);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  logScenario,
);

define(
  "commit-tab",
  async (shot) => {
    await shot.showLog();
    await commitRow(shot, "Cart: discount codes and totals").dblclick();
    const tab = shot.page.getByRole("region", { name: "Commit", exact: true });
    await tab.getByRole("listbox", { name: "Changed files" }).waitFor();
    await tab.locator(".cm-editor").first().waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  logScenario,
);

define(
  "log-context-menu",
  async (shot) => {
    await shot.showLog();
    await commitRow(shot, "Cart: discount codes and totals").click({ button: "right" });
    await shot.menu().waitFor();
    const list = shot.page.locator('[aria-label="Commits"]');
    const across = await shot.clipAround([list], 0);
    const down = await shot.clipAround([shot.menu(), commitRow(shot, "Cart: discount codes and totals")], {
      top: 70,
      bottom: 24,
    });
    await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
  },
  logScenario,
);

define(
  "branches-panel",
  async (shot) => {
    await openBranches(shot);
    await sidebarRow(shot, /^\s*Tags/).click();
    await shot.settle();
    await shot.page.mouse.move(640, 790);
    const sidebar = shot.page.locator("aside[aria-label=Left\\ panel]");
    await shot.save(await shot.clipPanel(sidebar, [sidebar.getByRole("treeitem").last()], 16));
  },
  branchesScenario,
);

define(
  "branch-context-menu",
  async (shot) => {
    await openBranches(shot);
    await sidebarRow(shot, "tax-rates").click({ button: "right" });
    await shot.menu().waitFor();
    const sidebar = shot.page.locator("aside[aria-label=Left\\ panel]");
    const panel = await shot.clipPanel(sidebar, [shot.menu(), sidebar.getByRole("treeitem").last()], 16);
    const across = await shot.clipAround([sidebar, shot.menu()], { right: 16 });
    await shot.save({ x: across.x, width: across.width, y: panel.y, height: panel.height });
  },
  branchesScenario,
);

define(
  "stashes",
  async (shot) => {
    await openBranches(shot);
    const stash = sidebarRow(shot, "WIP: free shipping threshold");
    await stash.hover();
    await shot.settle();
    const section = sidebarRow(shot, /^\s*Stashes/);
    const sidebar = await shot.page.locator("aside[aria-label=Left\\ panel]").boundingBox();
    const sectionBox = await section.boundingBox();
    const stashBox = await stash.boundingBox();
    if (!sidebar || !sectionBox || !stashBox) {
      throw new Error("stashes: the stash list is not visible");
    }
    const top = Math.max(sidebar.y, sectionBox.y - 120);
    await shot.save({ x: sidebar.x, y: top, width: sidebar.width, height: stashBox.y + stashBox.height + 16 - top });
  },
  branchesScenario,
);

// File > New File: an Untitled tab named after its first line, beside a file tab, with unsaved text.
define(
  "new-file-untitled",
  async (shot) => {
    await shot.openFile(join(storefront, "README.md"));
    await shot.openFile(cartTs());
    await menuAction(shot, "file.newFile");
    const editor = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-content");
    await editor.waitFor();
    await editor.click();
    await shot.page.keyboard.type(
      "Release notes\n\n- Faster checkout\n- Fix the cart total when a coupon is removed\n",
    );
    await shot.settle(600);
    await shot.page.mouse.move(640, 700);
    const main = shot.page.locator("main.main");
    const box = await main.boundingBox();
    if (!box) {
      throw new Error("new-file-untitled: no editor area");
    }
    await shot.save({ x: box.x, y: box.y, width: box.width, height: 260 });
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define("settings-remember-unsaved", async (shot) => {
  const dialog = await openSettings(shot, "Editor");
  await scrollSettingsTo(dialog, "Saving");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define("back-forward", async (shot) => {
  await shot.openFile(cartTs());
  await shot.openFile(join(storefront, "src/catalog.ts"));
  await shot.openFile(join(storefront, "src/pricing.ts"));
  await shot.page.getByRole("button", { name: "Go back" }).click();
  await shot.settle();
  await shot.page.mouse.move(640, 500);
  const header = shot.page.locator("header.header");
  const headerBox = await header.boundingBox();
  const clip = await shot.clipAround(
    [shot.page.getByRole("group", { name: "Navigation history" }), header.getByTitle(/^Branch:/)],
    { left: 0, right: 12 },
  );
  await shot.save({ ...clip, y: headerBox?.y ?? 0, height: headerBox?.height ?? clip.height });
});

for (const [name, section] of [
  ["settings-appearance", "Appearance"],
  ["settings-editor", "Editor"],
  ["settings-merge", "Git"],
  ["settings-layout", "Layout"],
  ["settings-updates", "Updates"],
  ["settings-files", "Settings Files"],
  ["settings-about", "About"],
] as const) {
  define(
    name,
    async (shot) => {
      const dialog = await openSettings(shot, section);
      await shot.page.mouse.move(5, 790);
      await shot.save(dialog);
    },
    () => (name === "settings-files" ? { settings: { tabSize: 2, wordWrap: true } } : {}),
  );
}

// The Editor section scrolls; this is its lower part, from the Editing features group down.
define("settings-editor-more", async (shot) => {
  const dialog = await openSettings(shot, "Editor");
  await scrollSettingsTo(dialog, "Editing features");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define(
  "settings-state-error",
  async (shot) => {
    // The start-up toast points at Settings; dismiss it so only the banner tells the story.
    const toastError = shot.page.locator(".toasts .toast.error", { hasText: "state.json could not be read" });
    await toastError.waitFor();
    await toastError.getByRole("button", { name: "Dismiss" }).click();
    const dialog = await openSettings(shot, "Settings Files");
    await dialog.getByText("state.json could not be read").waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ stateLoadError: "/Users/you/.nibtree/state.json is not valid JSON: expected value at line 1 column 1" }),
);

define(
  "editor-conflict-toolbar",
  async (shot) => {
    await shot.activateRepo("payments-api");
    await shot.openFile(appTs());
    await shot.page.locator(".cm-conflict-actions").first().waitFor();
    await shot.page.mouse.move(640, 790);
    const host = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden])");
    await shot.save(
      await shot.clipAround(
        [host.getByRole("toolbar", { name: "File actions" }), host.getByRole("toolbar", { name: "Conflict actions" })],
        {
          bottom: 4,
        },
      ),
    );
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define("diff-hunk-staging", async (shot) => {
  await collapseRepo(shot, "payments-api");
  await shot.page.getByRole("button", { name: "Hide files" }).click();
  await shot.page
    .getByRole("group", { name: "storefront", exact: true })
    .getByRole("region", { name: "Changes" })
    .getByText("cart.ts")
    .click();
  await shot.page.locator("[aria-label='Diff'] [title='Stage this change']").first().waitFor();
  await shot.settle(500);
  const stage = shot.page.locator("[aria-label='Diff'] [title='Stage this change']").first();
  await stage.hover();
  await shot.settle();
  const view = shot.page.getByRole("region", { name: "Diff", exact: true }).first();
  const across = await shot.clipAround([view], 0);
  const down = await shot.clipAround([view.locator(".toolbar"), stage], { bottom: 150 });
  await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
});

define("revert-change-diff", async (shot) => {
  await collapseRepo(shot, "payments-api");
  await shot.page.getByRole("button", { name: "Hide files" }).click();
  await shot.page
    .getByRole("group", { name: "storefront", exact: true })
    .getByRole("region", { name: "Changes" })
    .getByText("cart.ts")
    .click();
  const revert = shot.page.locator("[aria-label='Diff'] [title='Revert this change']").first();
  await revert.waitFor();
  await shot.settle(500);
  await revert.hover();
  await shot.settle();
  const view = shot.page.getByRole("region", { name: "Diff", exact: true }).first();
  const across = await shot.clipAround([view], 0);
  const down = await shot.clipAround([view.locator(".toolbar"), revert], { bottom: 150 });
  await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
});

define(
  "revert-change-commit",
  async (shot) => {
    await shot.showLog();
    await commitRow(shot, "Cart: discount codes and totals").click();
    const log = shot.page.getByRole("region", { name: "Log", exact: true });
    const revert = log.locator("[aria-label='Diff'] [title='Revert this change']").first();
    await revert.waitFor();
    await shot.settle(500);
    await revert.hover();
    await shot.settle();
    await shot.save(log.getByRole("region", { name: "Diff", exact: true }).first());
  },
  logScenario,
);

define(
  "revert-change-editor",
  async (shot) => {
    await shot.openFile(cartTs());
    const bar = shot.page.locator("main.main .cm-change-clickable .cm-change-bar").first();
    await bar.waitFor();
    await bar.hover();
    await shot.settle();
    await shot.save(shot.page.locator("main.main"));
  },
  () => ({ settings: { currentLineBlame: false } }),
);

/** Puts up a push, a failed pull, a fetch and a pull as the app words them, held on screen like a pointer over them. */
async function showSampleToasts(shot: Shot): Promise<void> {
  await inApp(
    shot,
    `const { toast } = await imp("/src/lib/ui/toast.svelte.ts");
    toast.success("Pushed 2 commits of main to origin/main", "main: 0867b60..7eba1a2", "storefront");
    toast.error("Could not pull into develop", "fatal: Not possible to fast-forward, aborting.", "payments-api");
    toast.info("Fetched origin: nothing new", undefined, "payments-api");
    toast.success("Pulled origin/main into main", "origin/main: 7eba1a2..fc63817\\nFast-forward\\n1 file changed, 1 insertion(+)", "storefront");
    for (const item of toast.items) { toast.hold(item.id, true); }`,
  );
  await shot.settle(400);
}

define("notification-toasts", async (shot) => {
  await showSampleToasts(shot);
  const balloons = shot.page.locator(".toasts .notification");
  await balloons.nth(3).waitFor();
  await shot.save(await shot.clipAround([balloons.first(), balloons.nth(3)], 16));
});

define("notifications-panel", async (shot) => {
  await showSampleToasts(shot);
  await inApp(
    shot,
    `const { toast } = await imp("/src/lib/ui/toast.svelte.ts");
    for (const item of [...toast.items]) { toast.dismiss(item.id); }`,
  );
  await menuAction(shot, "view.notifications");
  const panel = shot.page.getByRole("region", { name: "Notifications", exact: true });
  await panel.locator(".notification").nth(3).waitFor();
  const bar = shot.page.getByRole("navigation", { name: "Right sidebar" });
  await shot.page.mouse.move(640, 790);
  await shot.settle();
  await shot.save(await shot.clipAround([panel, bar], 0));
});

define("diff-staging-view", async (shot) => {
  await collapseRepo(shot, "payments-api");
  await shot.page.getByRole("button", { name: "Hide files" }).click();
  await shot.page
    .getByRole("group", { name: "storefront", exact: true })
    .getByRole("region", { name: "Changes" })
    .getByText("cart.ts")
    .click();
  await shot.page.getByRole("button", { name: "Three panes" }).click();
  const view = shot.page.getByRole("region", { name: "Staging view of cart.ts" });
  await view.locator(".cm-editor").nth(2).waitFor();
  await shot.settle(700);
  await shot.page.mouse.move(640, 790);
  await shot.save();
});

define("empty-main", async (shot) => {
  await shot.page.mouse.move(640, 790);
  const main = await shot.clipAround([shot.page.locator("main.main")]);
  const content = await shot.clipAround(
    [
      shot.page.locator('main.main [aria-label="Start"] > *').first(),
      shot.page.locator('main.main [aria-label="Start"] > *').last(),
    ],
    56,
  );
  // From the top, so the Navigation Bar above the welcome screen is in the shot.
  await shot.save({ x: main.x, width: main.width, y: main.y, height: content.y + content.height - main.y });
});

define(
  "git-progress",
  async (shot) => {
    // The header has no Fetch button any more: start it from the repository's ... menu.
    await collapseRepo(shot, "payments-api");
    await shot.page.getByRole("button", { name: "More actions for storefront" }).click();
    await menuLevel(shot, 0).waitFor();
    const submenu = await openSubmenu(shot, 0, "Pull, Push");
    await submenu.getByRole("menuitem", { name: "Fetch From All Remotes" }).click();
    const busy = shot.page.locator("header .busy");
    await busy.waitFor();
    await shot.page.mouse.move(640, 500);
    const header = shot.page.locator("header.header");
    const headerBox = await header.boundingBox();
    const clip = await shot.clipAround([busy, header.getByTitle("Settings (Cmd+,)")], { left: 14, right: 14 });
    await shot.save({ ...clip, y: headerBox?.y ?? 0, height: headerBox?.height ?? clip.height }, { settle: false });
  },
  () => ({ holdFetchMs: 6000, state: { sidebarWidth: 360 } }),
);

define(
  "scan-repositories",
  async (shot) => {
    const pill = shot.page.locator('header button[aria-haspopup="menu"]').first();
    const pillBox = await pill.boundingBox();
    await pill.click({ position: { x: 12, y: (pillBox?.height ?? 28) - 3 } });
    await shot.menu().getByRole("menuitem", { name: "Scan for Repositories" }).waitFor();
    await shot.page.mouse.move(640, 700);
    await shot.save(
      await shot.clipAround([shot.page.locator("header .left"), shot.menu()], {
        top: 0,
        left: 0,
        right: 40,
        bottom: 24,
      }),
    );
  },
  () => ({ state: { recentFolders: [designSystem] } }),
);

define(
  "dark-theme",
  async (shot) => {
    await overview(shot);
    await shot.save();
  },
  () => ({ colorScheme: "dark" }),
);

define(
  "update-dialog",
  async (shot) => {
    // The first automatic check runs 30 seconds after start; jump there instead of waiting.
    await shot.page.clock.fastForward(31000);
    const item = shot.page.getByRole("button", { name: /Update available/ });
    await item.waitFor();
    await item.click();
    const dialog = shot.page.getByRole("dialog");
    await dialog.waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ releases: githubReleases(), clock: true }),
);

// A manual check opens the dialog even for a skipped newest release, marked as skipped.
define(
  "update-dialog-skipped",
  async (shot) => {
    const settingsDialog = await openSettings(shot, "Updates");
    await settingsDialog.getByRole("button", { name: "Check Now", exact: true }).click();
    const dialog = shot.page.getByRole("dialog", { name: /is available/ });
    await dialog.waitFor();
    await dialog.getByText("You skipped this version.").waitFor();
    await dialog.getByRole("button", { name: "Stop Skipping", exact: true }).waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ releases: githubReleases(), state: { skippedVersion: "0.1.0" } }),
);

define(
  "whats-new",
  async (shot) => {
    const dialog = shot.page.getByRole("dialog");
    await dialog.waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ state: { lastRunVersion: "0.0.9" } }),
);

define("status-bar", async (shot) => {
  await shot.openFile(cartTs());
  await clickLine(shot, "useDiscount(code");
  await shot.page
    .locator("footer.status-bar")
    .getByRole("button", { name: /^Memory / })
    .waitFor();
  await shot.save(shot.page.locator("footer.status-bar"));
});

define("status-bar-clear-cache", async (shot) => {
  await shot.openFile(cartTs());
  const button = shot.page.getByRole("button", { name: "Clear Cache" });
  await button.waitFor();
  await button.hover();
  const memory = shot.page.locator("footer.status-bar").getByRole("button", { name: /^Memory / });
  await shot.save(await shot.clipAround([memory, button], { top: 40, left: 160 }));
});

define("help-menu", async (shot) => {
  await shot.page.getByRole("button", { name: "Report an issue" }).click();
  await shot.menu().waitFor();
  const bar = await shot.page.locator("footer.status-bar").boundingBox();
  const menu = await shot.menu().boundingBox();
  if (!bar || !menu) {
    throw new Error("help-menu: menu not visible");
  }
  const left = Math.max(0, Math.min(menu.x, VIEWPORT.width - 480) - 16);
  const top = menu.y - 16;
  await shot.save({ x: left, y: top, width: VIEWPORT.width - left, height: VIEWPORT.height - top });
});

define(
  "mergetool-mode",
  async (shot) => {
    await shot.page.locator("[role='region'][aria-label^='Merge '] .cm-editor").nth(2).waitFor();
    await shot.settle(600);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  () => ({
    launch: {
      mode: "mergeTool",
      base: join(paymentsApi, "src/app_BASE_4242.ts"),
      local: join(paymentsApi, "src/app_LOCAL_4242.ts"),
      remote: join(paymentsApi, "src/app_REMOTE_4242.ts"),
      merged: appTs(),
    },
    mergetool: { repoPath: paymentsApi, conflictPath: "src/app.ts" },
  }),
);

// ---------------------------------------------------------------------------------------------
// Helpers for the shots below: app modules, menu actions and real commands from the page.

/**
 * Runs `body` in the page as an async function; `imp(path)` imports an app module, the same instance
 * the app uses (Vite serves each source file once). Native menus cannot be clicked from the page, so
 * shots open dialogs through the functions the menu items call.
 */
async function inApp<T = unknown>(shot: Shot, body: string): Promise<T> {
  return (await shot.page.evaluate(`(async () => { const imp = (path) => window.__gmImport(path); ${body} })()`)) as T;
}

/** What a native menu item does (src/lib/menu/menuActions.ts). */
async function menuAction(shot: Shot, action: string): Promise<void> {
  await inApp(shot, `(await imp("/src/lib/menu/menuActions.ts")).runMenuAction(${JSON.stringify(action)});`);
  await shot.settle();
}

/** A real backend command through the page's gate, so the demo-only rule still applies. */
async function invokeApp<T = unknown>(shot: Shot, cmd: string, args: Record<string, unknown>): Promise<T> {
  // The backend's errors are plain objects, which Playwright would print as [object Object].
  const result = (await shot.page.evaluate(
    ([name, values]) =>
      (
        window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } }
      ).__TAURI_INTERNALS__
        .invoke(name, values)
        .then(
          (value) => ({ ok: true, value }),
          (error: unknown) => ({ ok: false, value: typeof error === "string" ? error : JSON.stringify(error) }),
        ),
    [cmd, args] as const,
  )) as { ok: boolean; value: unknown };
  if (!result.ok) {
    throw new Error(`${cmd}: ${String(result.value)}`);
  }
  return result.value as T;
}

/** The topmost modal dialog. */
function topDialog(shot: Shot): Locator {
  return shot.page.locator('[role="dialog"][aria-modal="true"]').last();
}

/** The open context menu at this depth: 0 is the root, 1 its open submenu. */
function menuLevel(shot: Shot, level: number): Locator {
  return shot.page.locator('.menu[role="menu"]').nth(level);
}

/** Hovers a menu item so its submenu opens. */
async function openSubmenu(shot: Shot, level: number, label: string | RegExp): Promise<Locator> {
  await menuLevel(shot, level).getByRole("menuitem", { name: label }).first().hover();
  const submenu = menuLevel(shot, level + 1);
  await submenu.waitFor();
  await shot.settle();
  return submenu;
}

/** Two workspace folders, acme and design-system, as a restored session. */
function twoFolderScenario(extra: Scenario = {}): Scenario {
  return {
    ...extra,
    launch: { mode: "app", repoPath: null },
    state: {
      lastSession: [acme, designSystem],
      sessionRecorded: true,
      // A workspace of several folders is keyed by their paths, one per line.
      activeRepos: { [`${acme}\n${designSystem}`]: storefront },
      ...(extra.state ?? {}),
    },
  };
}

const TERMINAL_STORE = "/src/lib/terminal/terminalStore.svelte.ts";

/** A neutral shell for terminal shots: sh reads none of your startup files. */
// GPU drawing leaves xterm's text rows empty, so shots draw terminals with the DOM renderer to wait on their text.
function terminalScenario(extra: Scenario = {}): Scenario {
  const settings = { terminalShell: "/bin/sh", currentLineBlame: false, terminalGpuAcceleration: false };
  return { ...extra, settings: { ...settings, ...(extra.settings ?? {}) } };
}

/** Starts a terminal (like the + button) and waits for its first prompt. */
async function newTerminal(shot: Shot, options: Record<string, unknown> = {}): Promise<number> {
  const key = await inApp<number>(
    shot,
    `const { terminalStore } = await imp(${JSON.stringify(TERMINAL_STORE)});
     const before = new Set(terminalStore.terminals.map((terminal) => terminal.key));
     await terminalStore.create(${JSON.stringify(options)});
     // A split terminal sits beside its source, not always last.
     return terminalStore.terminals.find((terminal) => !before.has(terminal.key)).key;`,
  );
  await waitForTerminalId(shot, key);
  // A short prompt with the folder name, and no pager, so output reads like a plain terminal.
  await terminalType(shot, key, "PS1='\\W $ '; export GIT_PAGER=cat; clear\r");
  await shot.page.waitForTimeout(400);
  return key;
}

async function waitForTerminalId(shot: Shot, key: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const terminalId = await inApp<number | null>(
      shot,
      `const { terminalStore } = await imp(${JSON.stringify(TERMINAL_STORE)});
       return terminalStore.find(${key})?.terminalId ?? null;`,
    );
    if (terminalId !== null) {
      return;
    }
    await shot.page.waitForTimeout(100);
  }
  throw new Error(`${shot.name}: terminal ${key} did not start`);
}

/** Types into a terminal's shell, like keys pressed in it. */
async function terminalType(shot: Shot, key: number, data: string): Promise<void> {
  await inApp(
    shot,
    `const { terminalStore } = await imp(${JSON.stringify(TERMINAL_STORE)});
     const { api } = await imp("/src/lib/api.ts");
     await api.terminalWrite(terminalStore.find(${key}).terminalId, ${JSON.stringify(data)});`,
  );
}

/** Waits until a visible terminal shows this text. */
async function terminalShows(shot: Shot, text: string): Promise<void> {
  await shot.page.locator(".terminal-view:not(.hidden) .xterm-rows", { hasText: text }).first().waitFor();
  await shot.settle();
}

/**
 * Kills the shells a shot started and closes Search Everywhere: both live in the app window's
 * backend and would outlive the page.
 */
async function closeTerminals(page: Page): Promise<void> {
  await page
    .evaluate(
      `(async () => { const { terminalStore } = await window.__gmImport(${JSON.stringify(TERMINAL_STORE)});
        for (const terminal of [...terminalStore.terminals]) { terminalStore.close(terminal.key); }
        (await window.__gmImport("/src/lib/search/fileSearchStore.svelte.ts")).fileSearch.close(); })()`,
    )
    .catch(() => undefined);
  await page.waitForTimeout(150).catch(() => undefined);
}

function bottomPanel(shot: Shot): Locator {
  return shot.page.getByRole("region", { name: "Bottom panel", exact: true });
}

/** The editor area plus the bottom panel, with the activity bar on the left. */
async function clipEditorAndPanel(
  shot: Shot,
  editorLines = 300,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const panel = await bottomPanel(shot).boundingBox();
  if (!panel) {
    throw new Error(`${shot.name}: the bottom panel is not visible`);
  }
  const top = Math.max(0, panel.y - editorLines);
  return {
    x: 0,
    y: top,
    width: shot.viewport.width,
    height: Math.min(shot.viewport.height, panel.y + panel.height) - top,
  };
}

// ---------------------------------------------------------------------------------------------
// Terminal and Scripts

define(
  "terminal-panel",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    await shot.openFile(cartTs());
    const key = await newTerminal(shot);
    await terminalType(shot, key, "git log --oneline -5\r");
    await terminalShows(shot, "lazy load product images");
    await shot.page.mouse.move(640, 300);
    await shot.save();
  },
  terminalScenario,
);

define(
  "terminal-shell-menu",
  async (shot) => {
    await newTerminal(shot);
    await bottomPanel(shot).getByRole("button", { name: "New terminal with shell" }).click();
    await shot.menu().waitFor();
    await shot.settle();
    const head = bottomPanel(shot).getByRole("toolbar", { name: "Bottom panel" });
    await shot.save(await shot.clipAround([head, shot.menu()], 16));
  },
  terminalScenario,
);

define(
  "terminal-list",
  async (shot) => {
    const first = await newTerminal(shot);
    await terminalType(shot, first, "git status --short\r");
    const second = await newTerminal(shot);
    const server = await newTerminal(shot, { folderPath: designSystem });
    await inApp(
      shot,
      `const { terminalStore } = await imp(${JSON.stringify(TERMINAL_STORE)}); terminalStore.rename(${server}, "server"); terminalStore.select(${second});`,
    );
    await terminalType(shot, second, "ls\r");
    await terminalShows(shot, "package.json");
    await shot.page.mouse.move(640, 200);
    await shot.save(bottomPanel(shot));
  },
  () => terminalScenario(twoFolderScenario()),
);

define(
  "terminal-editor-tab",
  async (shot) => {
    await shot.openFile(cartTs());
    await shot.openFile(join(storefront, "README.md"));
    const key = await newTerminal(shot, { location: "editor" });
    await terminalType(shot, key, "git status\r");
    await terminalShows(shot, "Changes not staged");
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  terminalScenario,
);

define("terminal-settings", async (shot) => {
  const dialog = await openSettings(shot, "Terminal");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define(
  "terminal-find",
  async (shot) => {
    await shot.openFile(cartTs());
    const key = await newTerminal(shot);
    await terminalType(shot, key, "git log --oneline -8\r");
    await terminalShows(shot, "lazy load product images");
    // Cmd+F inside the terminal opens its find bar, as a person would.
    await bottomPanel(shot).locator(".terminal-view:not(.hidden) .xterm-helper-textarea").focus();
    await shot.page.keyboard.press("Meta+f");
    const field = bottomPanel(shot).getByRole("textbox", { name: "Find in terminal" });
    await field.fill("cart");
    await bottomPanel(shot).locator(".find-bar .counter", { hasText: " of " }).waitFor();
    await shot.page.mouse.move(640, 200);
    await shot.settle();
    await shot.save(await clipEditorAndPanel(shot, 120));
  },
  terminalScenario,
);

define(
  "terminal-split",
  async (shot) => {
    const first = await newTerminal(shot);
    await terminalType(shot, first, "git status --short\r");
    const second = await newTerminal(shot, { splitFrom: first });
    await terminalType(shot, second, "ls\r");
    await terminalShows(shot, "package.json");
    const server = await newTerminal(shot, { folderPath: designSystem });
    // The split pair on screen, the third terminal alone in the list below it.
    await inApp(
      shot,
      `const { terminalStore } = await imp(${JSON.stringify(TERMINAL_STORE)}); terminalStore.rename(${server}, "server"); terminalStore.select(${second});`,
    );
    await shot.page.mouse.move(640, 200);
    await shot.settle();
    await shot.save(bottomPanel(shot));
  },
  () => terminalScenario(twoFolderScenario()),
);

function scriptsScenario(): Scenario {
  return twoFolderScenario({
    state: { leftPanel: "scripts", explorerOpen: false, sidebarWidth: 400 },
    settings: { terminalGpuAcceleration: false },
    viewport: { width: 1280, height: 520 },
  });
}

function scriptsPanel(shot: Shot): Locator {
  return shot.page.getByRole("tree", { name: "Scripts" });
}

async function openScripts(shot: Shot): Promise<void> {
  await scriptsPanel(shot).locator('[role="treeitem"]', { hasText: "Makefile" }).first().waitFor();
  await shot.settle();
}

function scriptRow(shot: Shot, name: string): Locator {
  return scriptsPanel(shot)
    .locator('[role="treeitem"][aria-level="2"]')
    .filter({ has: shot.page.getByText(name, { exact: true }) })
    .first();
}

define(
  "scripts-panel",
  async (shot) => {
    await openScripts(shot);
    await scriptRow(shot, "test").click();
    await shot.page.mouse.move(900, 500);
    await shot.settle();
    // The activity bar down to its Scripts button, next to the panel.
    const sidebar = await shot.page.locator("aside[aria-label=Left\\ panel]").boundingBox();
    const header = await shot.page.locator("header.header").boundingBox();
    if (!sidebar || !header) {
      throw new Error("scripts-panel: no sidebar");
    }
    await shot.save({ x: 0, y: header.y + header.height, width: sidebar.x + sidebar.width, height: sidebar.height });
  },
  scriptsScenario,
);

define(
  "scripts-node-version",
  async (shot) => {
    await openScripts(shot);
    const source = scriptsPanel(shot).locator('[role="treeitem"]', { hasText: "package.json" }).first();
    await source.locator('button[title$="Click to change."]').click();
    await shot.menu().waitFor();
    await shot.settle();
    await shot.page.mouse.move(900, 700);
    await shot.save(await shot.clipAround([source, shot.menu()], 16));
  },
  scriptsScenario,
);

define(
  "scripts-run-tab",
  async (shot) => {
    await openScripts(shot);
    await scriptRow(shot, "check").dblclick();
    await bottomPanel(shot)
      .locator('[aria-label="Run output"] .xterm-rows', { hasText: "Process finished" })
      .first()
      .waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(900, 300);
    await shot.save(bottomPanel(shot));
  },
  scriptsScenario,
);

// ---------------------------------------------------------------------------------------------
// Search Everywhere, find and replace, editing

function searchPopup(shot: Shot): Locator {
  return shot.page.locator('.popup[role="dialog"][aria-label="Search Everywhere"]');
}

/** Opens Search Everywhere like its shortcut (double Shift, Cmd+P, Cmd+O...) and types a query. */
async function openSearch(shot: Shot, opener: string, query: string, replace = false): Promise<Locator> {
  await inApp(
    shot,
    `(await imp("/src/lib/search/fileSearchStore.svelte.ts")).fileSearch.open(${JSON.stringify(opener)}, "", ${replace});`,
  );
  const popup = searchPopup(shot);
  await popup.waitFor();
  await shot.settle();
  if (query) {
    await popup.locator("input.query").first().fill(query);
  }
  // Indexing and searching report in the status at the top right.
  for (let attempt = 0; attempt < 100; attempt++) {
    // The palette draws its status only while it has one.
    const statusEl = popup.locator(".status");
    const status = (await statusEl.count()) > 0 ? (await statusEl.first().innerText()).trim() : "";
    if (!/^(Indexing|Searching)/.test(status)) {
      break;
    }
    await shot.page.waitForTimeout(100);
  }
  await shot.settle(500);
  return popup;
}

async function savePopup(shot: Shot, popup: Locator, padding = 16): Promise<void> {
  await shot.save(await shot.clipAround([popup], padding));
}

define(
  "search-everywhere-all",
  async (shot) => {
    await shot.openFile(cartTs());
    const popup = await openSearch(shot, "everywhere", "cart");
    await popup.locator(".section-title", { hasText: "Files" }).first().waitFor();
    await shot.page.mouse.move(5, 790);
    await savePopup(shot, popup);
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define(
  "search-everywhere-recent",
  async (shot) => {
    await shot.openFile(join(storefront, "README.md"));
    await shot.openFile(join(storefront, "src/catalog.ts"));
    await shot.openFile(cartTs());
    const popup = await openSearch(shot, "files", "");
    await popup.locator(".section-title", { hasText: "Recent Files" }).first().waitFor();
    await shot.page.mouse.move(5, 790);
    await savePopup(shot, popup);
  },
  () => ({ settings: { currentLineBlame: false } }),
);

// Recent Files (Cmd+E): the file before the one on screen is selected.
define(
  "recent-files",
  async (shot) => {
    await shot.openFile(join(storefront, "README.md"));
    await shot.openFile(join(storefront, "src/catalog.ts"));
    await shot.openFile(cartTs());
    await menuAction(shot, "edit.recentFiles");
    const popup = shot.page.locator('.popup[role="dialog"][aria-label="Recent Files"]');
    await popup.waitFor();
    await shot.settle(300);
    await shot.page.mouse.move(5, 790);
    await savePopup(shot, popup);
  },
  () => ({ settings: { currentLineBlame: false } }),
);

// Navigation Bar (Cmd+Up): the path bar with the file's folder listed and the file selected.
define(
  "navigation-bar",
  async (shot) => {
    await shot.openFile(cartTs());
    await menuAction(shot, "edit.navigationBar");
    const popup = shot.page.locator('[role="dialog"][aria-label^="Navigation bar"]');
    await popup.locator(".row.selected").waitFor();
    await shot.settle(300);
    await shot.page.mouse.move(5, 790);
    await shot.save(
      await shot.clipAround([shot.page.getByRole("toolbar", { name: "File actions" }).first(), popup], 12),
    );
  },
  () => ({ settings: { currentLineBlame: false } }),
);

// File toolbar Bottom: the whole path bar under the code, its list opened upward.
define(
  "navigation-bar-bottom",
  async (shot) => {
    await shot.openFile(cartTs());
    await menuAction(shot, "edit.navigationBar");
    const popup = shot.page.locator('[role="dialog"][aria-label^="Navigation bar"]');
    await popup.locator(".row.selected").waitFor();
    await shot.settle(300);
    await shot.page.mouse.move(5, 300);
    await shot.save(
      await shot.clipAround([shot.page.getByRole("toolbar", { name: "File actions" }).first(), popup], 12),
    );
  },
  () => ({ settings: { currentLineBlame: false, fileToolbar: "bottom" } }),
);

// File toolbar Hidden: Cmd+Up shows the bar floating at the top left of the editor.
define(
  "navigation-bar-hidden",
  async (shot) => {
    await shot.openFile(cartTs());
    await menuAction(shot, "edit.navigationBar");
    const popup = shot.page.locator('[role="dialog"][aria-label^="Navigation bar"]');
    await popup.locator(".row.selected").waitFor();
    await shot.settle(300);
    await shot.page.mouse.move(5, 790);
    await shot.save(await shot.clipAround([shot.page.locator(".editor-group.focused"), popup], { bottom: 12 }));
  },
  () => ({ settings: { currentLineBlame: false, fileToolbar: "none" } }),
);

define("search-everywhere-files", async (shot) => {
  const popup = await openSearch(shot, "files", "cart");
  await shot.page.mouse.move(5, 790);
  await savePopup(shot, popup);
});

define("search-everywhere-classes", async (shot) => {
  const popup = await openSearch(shot, "classes", "Cart");
  await shot.page.mouse.move(5, 790);
  await savePopup(shot, popup);
});

define("search-everywhere-symbols", async (shot) => {
  const popup = await openSearch(shot, "symbols", "Cart.add");
  await shot.page.mouse.move(5, 790);
  await savePopup(shot, popup);
});

define("search-everywhere-text", async (shot) => {
  const popup = await openSearch(shot, "text", "quantity");
  await shot.page.mouse.move(5, 790);
  await savePopup(shot, popup);
});

define("replace-in-files", async (shot) => {
  const popup = await openSearch(shot, "text", "quantity", true);
  await popup.getByRole("textbox", { name: "Replace with" }).fill("amount");
  await shot.settle(400);
  await shot.page.mouse.move(5, 790);
  await savePopup(shot, popup);
});

define(
  "find-replace-bar",
  async (shot) => {
    await shot.openFile(cartTs());
    await clickLine(shot, "export interface CartLine");
    await shot.page.keyboard.press("Meta+r");
    const bar = shot.page.locator(
      '[role=group][aria-label=Tab\\ content]:not([hidden]) [role="search"][aria-label="Find in file"]',
    );
    await bar.waitFor();
    const find = bar.getByRole("textbox", { name: "Find" });
    await find.fill("line");
    await find.press("Enter");
    await bar.getByRole("textbox", { name: "Replace" }).fill("entry");
    await shot.settle(300);
    await shot.page.mouse.move(640, 790);
    const editor = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-editor");
    const box = await editor.boundingBox();
    if (!box) {
      throw new Error("find-replace-bar: no editor");
    }
    await shot.save({ x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 420) });
  },
  () => ({ settings: { currentLineBlame: false } }),
);

define(
  "editor-whitespace",
  async (shot) => {
    await shot.openFile(join(designSystem, "Makefile"));
    await shot.page.mouse.move(640, 790);
    const editor = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-editor");
    const box = await editor.boundingBox();
    if (!box) {
      throw new Error("editor-whitespace: no editor");
    }
    await shot.save({ x: box.x, y: box.y, width: Math.min(box.width, 620), height: Math.min(box.height, 300) });
  },
  () => twoFolderScenario({ settings: { renderWhitespace: "all", currentLineBlame: false } }),
);

// Completion, indent guides and fold arrows (one block folded, the pointer over the gutter).
define(
  "editor-features",
  async (shot) => {
    await shot.openFile(cartTs());
    await clickLine(shot, "useDiscount(code");
    await menuAction(shot, "code.collapse");
    await clickLine(shot, "line.quantity = quantity;");
    await shot.page.keyboard.press("End");
    await shot.page.keyboard.press("Enter");
    await shot.page.keyboard.type("this.disc");
    const completion = shot.page.locator(
      "[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-tooltip-autocomplete",
    );
    await completion.waitFor();
    await shot.settle(300);
    const editor = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-editor");
    const box = await editor.boundingBox();
    const gutter = await shot.page
      .locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-gutters")
      .boundingBox();
    if (!box || !gutter) {
      throw new Error("editor-features: no editor");
    }
    // The gutter is as tall as the file: point at its visible part so the open arrows show.
    await shot.page.mouse.move(gutter.x + gutter.width - 7, box.y + 60);
    await shot.settle(300);
    // End on a whole line.
    const last = await shot.editorLine("get count(): number").boundingBox();
    const bottom = last ? last.y + last.height : box.y + 560;
    await shot.save({
      x: box.x,
      y: box.y,
      width: Math.min(box.width, 760),
      height: Math.min(box.height, bottom - box.y),
    });
  },
  () => ({ state: { explorerOpen: false }, settings: { currentLineBlame: false, tabSize: 2 } }),
);

/** Opens an image or PDF from notes/ in the preview and returns the tab's area. */
async function openPreview(
  shot: Shot,
  fileName: string,
  ready: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await shot.expand(notes);
  await shot.fileRow(join(notes, fileName)).dblclick();
  await shot.page.locator(`[role=group][aria-label=Tab\\ content]:not([hidden]) .media ${ready}`).waitFor();
  await shot.settle(1200);
  await shot.page.mouse.move(640, 790);
  const box = await shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden])").boundingBox();
  if (!box) {
    throw new Error(`${fileName}: no preview`);
  }
  return box;
}

define(
  "media-preview-image",
  async (shot) => {
    const box = await openPreview(shot, "logo.png", "img");
    await shot.save(box);
  },
  () => twoFolderScenario({ state: { explorerOpen: true }, viewport: { width: 1280, height: 760 } }),
);

define(
  "diff-binary-image",
  async (shot) => {
    const changes = shot.page
      .getByRole("group", { name: "brand-kit", exact: true })
      .getByRole("region", { name: "Changes" });
    await changes.getByText("logo.png").click();
    await shot.page.waitForFunction(() => {
      const images = [...document.querySelectorAll<HTMLImageElement>("[aria-label='Diff'] .binary-preview img")];
      return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
    });
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save(await shot.clipAround([shot.page.getByRole("region", { name: "Diff", exact: true }).first()], 0));
  },
  () => ({ launch: { mode: "app", repoPath: brandKit }, state: { activeRepos: {}, explorerOpen: false } }),
);

// media-preview-pdf.png is taken by hand: Playwright's WebKit has no PDF viewer, so this page would
// show an empty frame. Open notes/lorem-ipsum.pdf of the demo in the real app window and capture it
// (nibtree cli screenshot, or Cmd+Shift+4 then Space), then crop to the document. See
// docs/wiki/developer/How-the-Image-and-PDF-Preview-Works.md.

define(
  "diff-inline",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    await shot.page.getByRole("button", { name: "Hide files" }).click();
    await shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("region", { name: "Changes" })
      .getByText("cart.ts")
      .click();
    await shot.page.locator("[aria-label='Diff'] .cm-inlineDiff .cm-inlineRemoved").first().waitFor();
    await shot.settle(500);
    const view = shot.page.getByRole("region", { name: "Diff", exact: true }).first();
    const box = await view.boundingBox();
    if (!box) {
      throw new Error("diff-inline: no diff view");
    }
    await shot.save({ x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 560) });
  },
  () => ({ settings: { diffLayout: "inline" } }),
);

define(
  "diff-split-resize",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    await shot.page.getByRole("button", { name: "Hide files" }).click();
    await shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("region", { name: "Changes" })
      .getByText("cart.ts")
      .click();
    await shot.page.locator("[aria-label='Diff'] .cm-mergeView, [aria-label='Diff'] .cm-merge-a").first().waitFor();
    await shot.settle(500);
    const handle = shot.page.getByRole("separator", { name: "Resize the two sides of the diff" }).first();
    await handle.hover();
    await shot.settle();
    const view = shot.page.getByRole("region", { name: "Diff", exact: true }).first();
    const box = await view.boundingBox();
    if (!box) {
      throw new Error("diff-split-resize: no diff view");
    }
    await shot.save({ x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 560) });
  },
  () => ({ state: { diffSplitRatio: 0.38 } }),
);

// ---------------------------------------------------------------------------------------------
// Markdown, color themes and Settings

const checkoutMd = () => join(storefront, "docs/checkout.md");

async function openMarkdown(shot: Shot): Promise<void> {
  await shot.openFile(checkoutMd());
  await shot.page
    .locator('[role=group][aria-label=Tab\\ content]:not([hidden]) [role="toolbar"][aria-label="Markdown"]')
    .waitFor();
  await shot.settle(500);
}

/** Scrolls the visible text editor so the line with this text is near its top. */
async function scrollLineToTop(shot: Shot, text: string): Promise<void> {
  await clickLine(shot, text);
  await shot.page.evaluate((needle) => {
    const scroller = document.querySelector<HTMLElement>(
      "[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-scroller",
    );
    const line = [
      ...document.querySelectorAll<HTMLElement>(
        "[role=group][aria-label=Tab\\ content]:not([hidden]) .cm-content .cm-line",
      ),
    ].find((element) => (element.textContent ?? "").includes(needle));
    if (scroller && line) {
      scroller.scrollTop += line.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
    }
  }, text);
  await shot.settle(600);
}

function markdownScenario(extra: Scenario = {}): Scenario {
  return {
    ...extra,
    state: { explorerOpen: false, ...(extra.state ?? {}) },
    settings: { currentLineBlame: false, ...(extra.settings ?? {}) },
  };
}

define(
  "markdown-split",
  async (shot) => {
    await openMarkdown(shot);
    await shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) table").first().waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  () => markdownScenario(),
);

define(
  "markdown-toolbar",
  async (shot) => {
    await openMarkdown(shot);
    await clickLine(shot, "## Steps");
    const toolbar = shot.page.locator(
      '[role=group][aria-label=Tab\\ content]:not([hidden]) [role="toolbar"][aria-label="Markdown"]',
    );
    await toolbar.getByRole("button", { name: "Heading", exact: true }).click();
    await shot.menu().waitFor();
    await shot.settle();
    await shot.page.mouse.move(640, 790);
    // The view switch sits in the path bar above the formatting row.
    const modes = shot.page.locator(
      '[role=group][aria-label=Tab\\ content]:not([hidden]) [role="radiogroup"][aria-label="Markdown view"]',
    );
    await shot.save(await shot.clipAround([toolbar, modes, shot.menu()], 10));
  },
  () => markdownScenario(),
);

define(
  "markdown-rich-editor",
  async (shot) => {
    await openMarkdown(shot);
    const rich = shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .rich-markdown");
    await rich.waitFor();
    await rich.locator("table").first().waitFor();
    await shot.settle(600);
    // A caret at the end of the intro paragraph shows that the page is editable.
    const intro = rich.locator("p", { hasText: "Checkout turns a cart" }).first();
    const box = await intro.boundingBox();
    if (box) {
      await intro.click({ position: { x: box.width - 2, y: box.height - 6 } });
      await shot.page.keyboard.press("End");
    }
    // The preview follows the source position, which can leave it scrolled down: show the top.
    await shot.page.evaluate(() => {
      let element: HTMLElement | null = document.querySelector<HTMLElement>(
        "[role=group][aria-label=Tab\\ content]:not([hidden]) .rich-markdown",
      );
      while (element) {
        element.scrollTop = 0;
        element = element.parentElement;
      }
    });
    await shot.settle(400);
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  () => markdownScenario({ settings: { markdownViewMode: "preview" } }),
);

define(
  "markdown-mermaid",
  async (shot) => {
    await openMarkdown(shot);
    await scrollLineToTop(shot, "## Flow");
    await shot.page.locator("[role=group][aria-label=Tab\\ content]:not([hidden]) .md-mermaid svg").first().waitFor();
    await shot.settle(600);
    await shot.page.mouse.move(640, 790);
    await shot.save(shot.page.locator("main.main"));
  },
  () => markdownScenario(),
);

async function waitForColorTheme(shot: Shot, themeId: string): Promise<void> {
  await shot.page.waitForFunction((id) => document.documentElement.getAttribute("data-color-theme") === id, themeId);
  await shot.settle();
}

define(
  "color-theme-pickers",
  async (shot) => {
    const dialog = await openSettings(shot, "Editor");
    await waitForColorTheme(shot, "dracula");
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ colorScheme: "dark", settings: { theme: "dark", darkColorTheme: "dracula" } }),
);

define(
  "color-theme-dracula",
  async (shot) => {
    await waitForColorTheme(shot, "dracula");
    await overview(shot);
    await shot.save();
  },
  () => ({ colorScheme: "dark", settings: { theme: "dark", darkColorTheme: "dracula" } }),
);

define(
  "color-theme-solarized-light",
  async (shot) => {
    await waitForColorTheme(shot, "solarized-light");
    await overview(shot);
    await shot.save();
  },
  () => ({ colorScheme: "light", settings: { theme: "light", lightColorTheme: "solarized-light" } }),
);

define(
  "rounded-panels",
  async (shot) => {
    await shot.page.waitForFunction(() => document.documentElement.hasAttribute("data-rounded-panels"));
    await overview(shot);
    await shot.save();
  },
  () => ({ colorScheme: "dark", settings: { theme: "dark", roundedPanels: true } }),
);

define(
  "rounded-panels-islet-light",
  async (shot) => {
    await waitForColorTheme(shot, "islet-light");
    await shot.page.waitForFunction(() => document.documentElement.hasAttribute("data-rounded-panels"));
    await overview(shot);
    await shot.save();
  },
  () => ({ colorScheme: "light", settings: { theme: "light", lightColorTheme: "islet-light", roundedPanels: true } }),
);

define(
  "color-theme-high-contrast",
  async (shot) => {
    await waitForColorTheme(shot, "high-contrast-dark");
    await shot.page.waitForFunction(() => document.documentElement.getAttribute("data-contrast") === "high");
    await collapseRepo(shot, "payments-api");
    await shot.page.getByRole("button", { name: "Hide files" }).click();
    await shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("region", { name: "Changes" })
      .getByText("cart.ts")
      .click();
    await shot.page.locator("[aria-label='Diff'] .cm-mergeView, [aria-label='Diff'] .cm-merge-a").first().waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  () => ({ colorScheme: "dark", settings: { theme: "dark", darkColorTheme: "high-contrast-dark" } }),
);

/** Scrolls the Settings section so the row or heading with this text is at the top. */
/** The scrolling rows of the open Settings section. */
function settingsRows(dialog: Locator): Locator {
  return dialog.getByRole("region", { name: "Settings content" });
}

/**
 * A row of the open Settings section by its title, or by the exact words of a button in it. Hints may name other
 * settings, so the hint text is not used; a title may end with a memory flag.
 */
function settingsRow(dialog: Locator, title: string): Locator {
  const page = dialog.page();
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = page
    .locator(".title", { hasText: new RegExp(`^${escaped}`) })
    .or(page.getByText(title, { exact: true }));
  return dialog.locator(".row").filter({ has: named }).first();
}

/** A group title of the open Settings section. */
function settingsGroup(dialog: Locator, title: string): Locator {
  return dialog.getByRole("heading", { name: title, level: 4 });
}

async function scrollSettingsTo(dialog: Locator, text: string): Promise<void> {
  await settingsRows(dialog).evaluate((rows, needle) => {
    const target = [...rows.querySelectorAll<HTMLElement>(".row, [role='heading']")].find((element) =>
      (element.querySelector(".title")?.textContent ?? element.textContent ?? "").trim().startsWith(needle),
    );
    if (target) {
      rows.scrollTop += target.getBoundingClientRect().top - rows.getBoundingClientRect().top - 8;
    }
  }, text);
}

define("settings-search", async (shot) => {
  const dialog = await openSettings(shot, "Editor");
  await dialog.getByRole("textbox", { name: "Search settings" }).fill("font");
  await shot.settle();
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define("settings-editor-fonts", async (shot) => {
  const dialog = await openSettings(shot, "Editor");
  await scrollSettingsTo(dialog, "Editor font family");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define("settings-unload-hidden-tabs", async (shot) => {
  const dialog = await openSettings(shot, "Editor");
  await scrollSettingsTo(dialog, "Unload hidden tabs");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define(
  "editor-font-weight",
  async (shot) => {
    const dialog = await openSettings(shot, "Editor");
    await scrollSettingsTo(dialog, "Editor font family");
    await shot.settle();
    const preview = dialog.locator(".font-preview");
    const weight = settingsRow(dialog, "Editor font weight");
    const across = await shot.clipAround([settingsRows(dialog)], 0);
    const down = await shot.clipAround([preview, weight], { top: 12, bottom: 12 });
    await shot.page.mouse.move(5, 790);
    await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
  },
  () => ({ settings: { editorFontWeight: 300 } }),
);

define("settings-automation", async (shot) => {
  const dialog = await openSettings(shot, "Automation");
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
});

define(
  "git-console-setting",
  async (shot) => {
    const dialog = await openSettings(shot, "Git");
    const row = settingsRow(dialog, "Show Git Console");
    await row.waitFor();
    const above = row.locator("xpath=preceding-sibling::*[1]");
    await shot.page.mouse.move(5, 790);
    await shot.save(await shot.clipAround([above, row], { top: 0, bottom: 8, left: 0, right: 0 }));
  },
  () => ({ settings: { gitConsole: true } }),
);

const signedInAccount = {
  host: "github.com",
  login: "maya-chen",
  name: "Maya Chen",
  source: "token",
  missingScopes: [],
};

define(
  "github-sign-in",
  async (shot) => {
    const dialog = await openSettings(shot, "GitHub");
    await dialog.getByRole("button", { name: "Use GitHub CLI" }).waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ github: { account: null, cli: { installed: true, signedIn: true } } }),
);

define(
  "github-signed-in",
  async (shot) => {
    const dialog = await openSettings(shot, "GitHub");
    await dialog.getByRole("button", { name: "Sign Out" }).waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ github: { account: signedInAccount, cli: { installed: false, signedIn: false } } }),
);

define(
  "mcp-settings",
  async (shot) => {
    const dialog = await openSettings(shot, "Automation");
    await dialog.getByText("Running at http://127.0.0.1:48731/mcp").first().waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ settings: { mcpEnabled: true, mcpPort: 48731 } }),
);

define(
  "mcp-cli-settings",
  async (shot) => {
    const dialog = await openSettings(shot, "Automation");
    await dialog.getByRole("button", { name: "Install in ~/.local/bin" }).waitFor();
    await scrollSettingsTo(dialog, "Command line tool");
    await shot.page.mouse.move(5, 790);
    await shot.save(dialog);
  },
  () => ({ settings: { mcpEnabled: false, cliEnabled: true } }),
);

define(
  "memory-log-settings",
  async (shot) => {
    const dialog = await openSettings(shot, "Automation");
    await dialog.getByRole("button", { name: "Reveal in Finder" }).waitFor();
    await scrollSettingsTo(dialog, "Memory log");
    await shot.settle();
    const heading = settingsGroup(dialog, "Memory log");
    const last = settingsRow(dialog, "Log file");
    const rows = settingsRows(dialog);
    const across = await shot.clipAround([rows], 0);
    const down = await shot.clipAround([heading, last], { top: 12, bottom: 12 });
    await shot.page.mouse.move(5, 790);
    await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
  },
  () => ({ settings: { memoryLogEnabled: true } }),
);

define("settings-memory-flags", async (shot) => {
  const dialog = await openSettings(shot, "Terminal");
  await scrollSettingsTo(dialog, "Rendering");
  await shot.settle();
  const heading = settingsGroup(dialog, "Rendering");
  const gpu = settingsRow(dialog, "GPU acceleration");
  const across = await shot.clipAround([settingsRows(dialog)], 0);
  const down = await shot.clipAround([heading, gpu], { top: 12, bottom: 12 });
  await shot.page.mouse.move(5, 790);
  await shot.save({ x: across.x, width: across.width, y: down.y, height: down.height });
});

// ---------------------------------------------------------------------------------------------
// The Git menu, its dialogs and interactive rebase

/** A storefront commit id by its summary, read with git in this script. */
function storefrontCommit(summary: string): string {
  return (
    execFileSync("git", ["-C", storefront, "log", "--all", "--format=%H %s"], { encoding: "utf8" })
      .split("\n")
      .find((line) => line.slice(41) === summary)
      ?.slice(0, 40) ?? ""
  );
}

/** Opens a Git dialog through its menu action and waits for it. */
async function gitDialog(shot: Shot, action: string): Promise<Locator> {
  await menuAction(shot, action);
  const dialog = topDialog(shot);
  await dialog.waitFor();
  await shot.settle(400);
  return dialog;
}

async function saveDialog(shot: Shot, dialog: Locator): Promise<void> {
  await shot.page.mouse.move(5, 790);
  await shot.save(dialog);
}

function fieldInput(dialog: Locator, label: string): Locator {
  return dialog.locator("label.field", { hasText: label }).locator("input").first();
}

define("menus-shortcuts-window", async (shot) => {
  await menuAction(shot, "help.shortcuts");
  const dialog = topDialog(shot);
  await dialog.waitFor();
  await dialog.getByRole("textbox", { name: "Filter shortcuts" }).fill("git menu");
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-menu-create-patch", async (shot) => {
  const dialog = await gitDialog(shot, "git.patch.create");
  await dialog.getByText("Staged changes", { exact: true }).waitFor();
  await saveDialog(shot, dialog);
  await shot.page.keyboard.press("Escape");
});

/** The editor area of the main window, tab strip included. */
function editorArea(shot: Shot): Locator {
  return shot.page.locator("main.main");
}

define(
  "git-menu-file-history",
  async (shot) => {
    await shot.openFile(cartTs());
    await menuAction(shot, "git.file.history");
    const row = shot.page.locator("main.main").getByText("Cart: discount codes and totals rounded to cents").first();
    await row.waitFor();
    await row.click();
    await shot.page.locator("main.main .cm-editor").last().waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save(editorArea(shot));
  },
  () => ({ state: { explorerOpen: false }, settings: { currentLineBlame: false } }),
);

define(
  "git-menu-line-history",
  async (shot) => {
    await shot.openFile(cartTs());
    // Three lines above the uncommitted insert, so the working copy and HEAD number them alike.
    await clickLine(shot, "export class Cart");
    await shot.page.keyboard.press("Home");
    await shot.page.keyboard.press("Shift+ArrowDown");
    await shot.page.keyboard.press("Shift+ArrowDown");
    await shot.page.keyboard.press("Shift+End");
    await menuAction(shot, "git.file.historySelection");
    await shot.page.locator("main.main .tab", { hasText: "History: cart.ts:" }).first().waitFor();
    await shot.settle(800);
    await shot.page.mouse.move(640, 790);
    await shot.save(editorArea(shot));
  },
  () => ({ state: { explorerOpen: false }, settings: { currentLineBlame: false } }),
);

define(
  "git-menu-compare-revision",
  async (shot) => {
    const revision = storefrontCommit("Cart: support quantities and a subtotal");
    await shot.openFile(cartTs());
    await inApp(
      shot,
      `const { repoStore } = await imp("/src/lib/stores/repo.svelte.ts");
     const { gitTabPath } = await imp("/src/lib/stores/gitTabs.ts");
     repoStore.openPseudoTab(gitTabPath({ kind: "compare", repoRoot: ${JSON.stringify(storefront)}, filePath: "src/cart.ts", revision: ${JSON.stringify(revision)} }));`,
    );
    await shot.page.locator("main.main .cm-editor").last().waitFor();
    await shot.settle(800);
    await shot.page.mouse.move(640, 790);
    await shot.save(editorArea(shot));
  },
  () => ({ state: { explorerOpen: false }, settings: { currentLineBlame: false } }),
);

define("git-push-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.push");
  await dialog.getByText("Catalog: lazy load product images").waitFor();
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-pull-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.pull");
  await saveDialog(shot, dialog);
});

define("git-update-project-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.updateProject");
  await saveDialog(shot, dialog);
});

define("git-merge-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.merge");
  await fieldInput(dialog, "Branch to merge").fill("fix/tax-rates");
  await dialog.locator("label.check", { hasText: "--no-ff" }).locator("input").check();
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-rebase-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.rebase");
  await fieldInput(dialog, "Onto").fill("fix/tax-rates");
  await dialog.locator("label.check", { hasText: "--update-refs" }).locator("input").check();
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-reset-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.resetHead");
  await dialog.getByPlaceholder("HEAD, a commit id or a branch").fill("HEAD~1");
  await dialog
    .getByText(/^Commit [0-9a-f]{8}/)
    .first()
    .waitFor();
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-rollback-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.rollback");
  await dialog.locator('[aria-label="Files to roll back"]').getByRole("checkbox").last().uncheck();
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("git-remotes-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.manageRemotes");
  await dialog.getByText("origin").first().waitFor();
  await saveDialog(shot, dialog);
});

define("git-clone-dialog", async (shot) => {
  const dialog = await gitDialog(shot, "git.clone");
  await fieldInput(dialog, "Repository URL").fill("https://github.com/acme/storefront.git");
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

async function openRebaseFromLog(shot: Shot, summary: string): Promise<Locator> {
  await shot.showLog();
  await commitRow(shot, summary).click({ button: "right" });
  await shot.menu().getByRole("menuitem", { name: "Interactively Rebase from Here..." }).click();
  const dialog = topDialog(shot);
  await dialog.getByRole("list", { name: "Commits to rebase" }).waitFor();
  await shot.settle(400);
  return dialog;
}

function rebaseRow(dialog: Locator, summary: string): Locator {
  return dialog.getByRole("button", { name: new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
}

define(
  "interactive-rebase-dialog",
  async (shot) => {
    const dialog = await openRebaseFromLog(shot, "Cart: discount codes and totals rounded to cents");
    await rebaseRow(dialog, "Docs: explain the cart API").locator("select").selectOption("reword");
    const reword = dialog.getByLabel(/^New message for /).first();
    await reword.fill("Docs: explain the cart API and discount codes");
    await rebaseRow(dialog, "Catalog: lazy load product images").locator("select").selectOption("squash");
    await shot.settle(300);
    await saveDialog(shot, dialog);
  },
  logScenario,
);

define(
  "interactive-rebase-merges",
  async (shot) => {
    const dialog = await openRebaseFromLog(shot, "Catalog: search by name");
    await saveDialog(shot, dialog);
  },
  logScenario,
);

// ---------------------------------------------------------------------------------------------
// Repository actions, commit options, .gitignore, Branches popup

function wideSidebar(extra: Scenario = {}): Scenario {
  return { ...extra, state: { sidebarWidth: 360, ...(extra.state ?? {}) } };
}

function repoHeader(shot: Shot, repoName: string): Locator {
  // The header is a Row (role button with aria-expanded); the groups' toggles inside are real buttons.
  return shot.page
    .getByRole("group", { name: repoName, exact: true })
    .locator("[role='button'][aria-expanded]")
    .first();
}

/** The commit box under the Changes list (or a repository's own, with several). */
function commitBox(shot: Shot): Locator {
  return shot.page.getByRole("group", { name: "Commit box", exact: true }).first();
}

async function openRepoMenu(shot: Shot, repoName: string): Promise<Locator> {
  await shot.page.getByRole("button", { name: `More actions for ${repoName}` }).click();
  const menu = menuLevel(shot, 0);
  await menu.waitFor();
  await shot.settle(400);
  return menu;
}

define(
  "repo-actions-row",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    await shot.page.mouse.move(640, 500);
    const header = repoHeader(shot, "storefront");
    const staged = shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("region", { name: "Staged", exact: true })
      .getByRole("button")
      .first();
    const sidebar = await shot.page.locator("aside[aria-label=Left\\ panel]").boundingBox();
    const down = await shot.clipAround([header, staged], { top: 4, bottom: 4 });
    if (!sidebar) {
      throw new Error("repo-actions-row: no sidebar");
    }
    await shot.save({ x: sidebar.x, width: sidebar.width, y: down.y, height: down.height });
  },
  () => wideSidebar(),
);

/** Starts a clip at the sidebar's left edge, so it does not cut through the activity bar. */
async function fromSidebarEdge(shot: Shot, clip: { x: number; y: number; width: number; height: number }) {
  const sidebar = await shot.page.locator("aside[aria-label=Left\\ panel]").boundingBox();
  if (!sidebar) {
    return clip;
  }
  const left = Math.floor(sidebar.x);
  return { ...clip, x: left, width: clip.x + clip.width - left };
}

define(
  "repo-actions-menu",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    const menu = await openRepoMenu(shot, "storefront");
    const submenu = await openSubmenu(shot, 0, "Branch");
    const top = shot.page.locator("aside[aria-label=Left\\ panel] .head").first();
    await shot.save(
      await fromSidebarEdge(
        shot,
        await shot.clipAround([top, repoHeader(shot, "storefront"), menu, submenu], { top: 0, right: 16, bottom: 16 }),
      ),
    );
  },
  () => wideSidebar(),
);

define(
  "remotes-pull-push-menu",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    const menu = await openRepoMenu(shot, "storefront");
    const submenu = await openSubmenu(shot, 0, "Pull, Push");
    await shot.save(
      await fromSidebarEdge(
        shot,
        await shot.clipAround([repoHeader(shot, "storefront"), menu, submenu], { top: 4, right: 16, bottom: 16 }),
      ),
    );
  },
  () => wideSidebar(),
);

async function typeCommitMessage(shot: Shot): Promise<void> {
  await collapseRepo(shot, "payments-api");
  await shot.page.getByRole("textbox", { name: "Commit message" }).click();
  await shot.page.keyboard.type("Cart: set line quantities\n\nZero removes the line, and totals never go below zero.");
}

define(
  "commit-dropdown",
  async (shot) => {
    await typeCommitMessage(shot);
    await shot.page.getByRole("button", { name: "More commit actions" }).click();
    await shot.menu().waitFor();
    await shot.settle();
    await shot.save(await shot.clipAround([commitBox(shot), shot.menu()], 8));
  },
  () => wideSidebar(),
);

define(
  "commit-options",
  async (shot) => {
    await typeCommitMessage(shot);
    await shot.page.locator('button[aria-label="Commit Options"]').click();
    const panel = shot.page.locator('[role="dialog"][aria-label="Commit Options"]');
    await panel.waitFor();
    await shot.settle();
    await shot.save(await shot.clipAround([panel, commitBox(shot)], 8));
  },
  () => wideSidebar({ settings: { commitSignOff: true } }),
);

define(
  "gitignore-menu",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    const row = shot.page
      .getByRole("group", { name: "storefront", exact: true })
      .getByRole("region", { name: "Changes" })
      .getByText("wishlist.ts");
    await row.click({ button: "right" });
    const menu = menuLevel(shot, 0);
    await menu.waitFor();
    const submenu = await openSubmenu(shot, 0, "Add to .gitignore");
    await shot.save(await shot.clipAround([row, menu, submenu], 16));
  },
  () => wideSidebar(),
);

async function openBranchesPopup(shot: Shot): Promise<Locator> {
  await collapseRepo(shot, "payments-api");
  await repoHeader(shot, "storefront")
    .getByRole("button", { name: /^Checkout branch or tag, current main/ })
    .first()
    .click();
  const dialog = topDialog(shot);
  await dialog.getByRole("listbox", { name: "Branches" }).getByRole("option").first().waitFor();
  await shot.settle(300);
  return dialog;
}

async function openBranchSubmenu(shot: Shot, dialog: Locator, branchName: string): Promise<Locator> {
  await dialog
    .getByRole("listbox", { name: "Branches" })
    .getByRole("option")
    .filter({ has: shot.page.getByText(branchName, { exact: true }) })
    .first()
    .click();
  const menu = shot.menu().last();
  await menu.waitFor();
  await shot.settle(300);
  return menu;
}

define(
  "branches-popup",
  async (shot) => {
    const dialog = await openBranchesPopup(shot);
    const menu = await openBranchSubmenu(shot, dialog, "fix/tax-rates");
    await shot.save(await shot.clipAround([dialog, menu], 16));
  },
  () => wideSidebar(),
);

define(
  "branches-compare-tab",
  async (shot) => {
    const dialog = await openBranchesPopup(shot);
    const menu = await openBranchSubmenu(shot, dialog, "fix/tax-rates");
    await menu.getByRole("menuitem", { name: "Compare with 'main'" }).click();
    const tab = shot.page.locator("main.main");
    await tab
      .getByText(/^Files that differ/)
      .first()
      .waitFor();
    await shot.settle(400);
    const firstFile = tab.locator(".file, [role='option']", { hasText: ".ts" }).first();
    await firstFile.click();
    await tab.locator(".cm-editor").first().waitFor();
    await shot.settle(600);
    await shot.page.mouse.move(640, 790);
    await shot.save(tab);
  },
  () => wideSidebar({ state: { explorerOpen: false } }),
);

// ---------------------------------------------------------------------------------------------
// Git Console, Shelf, GitHub, worktrees, submodules and Git LFS

define(
  "git-console",
  async (shot) => {
    await collapseRepo(shot, "payments-api");
    // Only commands run after the switch is on are recorded; start from an empty list.
    await invokeApp(shot, "git_console_clear", {});
    await invokeApp(shot, "stage_files", { repoPath: storefront, filePaths: ["src/wishlist.ts"] });
    await invokeApp(shot, "unstage_files", { repoPath: storefront, filePaths: ["src/wishlist.ts"] });
    await invokeApp(shot, "fetch_all", { repoPath: storefront });
    await invokeApp(shot, "pull", { repoPath: paymentsApi, rebase: false }).catch(() => undefined);
    await invokeApp(shot, "fetch", { repoPath: storefront, prune: true });
    await shot.settle();
    await inApp(shot, `(await imp(${JSON.stringify(TERMINAL_STORE)})).terminalStore.showTab("gitConsole");`);
    const list = shot.page.getByRole("list", { name: "Git commands" });
    await list.waitFor();
    await shot.settle(500);
    await shot.clearToasts().catch(() => undefined);
    // The row of a failed command: its status dot is named "Failed...".
    await list
      .getByRole("button")
      .filter({ has: shot.page.locator('[aria-label^="Failed"]') })
      .first()
      .click();
    await shot.settle(400);
    await shot.page.mouse.move(640, 200);
    await shot.save();
  },
  () => ({ settings: { gitConsole: true, currentLineBlame: false } }),
);

define("shelf-shelve-dialog", async (shot) => {
  await inApp(shot, `(await imp("/src/lib/shelf/shelfActions.svelte.ts")).openShelveDialog();`);
  const dialog = topDialog(shot);
  await dialog.waitFor();
  await dialog.locator("label.field", { hasText: "Name" }).locator("input").fill("Cart quantities");
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

define("shelf-panel", async (shot) => {
  // keepInWorkingTree leaves the files as they are, so later shots see the same changes.
  try {
    await invokeApp(shot, "shelve_changes", {
      repoPath: storefront,
      name: "Shipping and wishlist",
      filePaths: ["src/shipping.ts", "src/wishlist.ts"],
      keepInWorkingTree: true,
    });
    await shot.page.waitForTimeout(1100);
    await invokeApp(shot, "shelve_changes", {
      repoPath: storefront,
      name: "Cart quantities",
      filePaths: ["src/cart.ts"],
      keepInWorkingTree: true,
    });
    await inApp(shot, `(await imp("/src/lib/shelf/shelfActions.svelte.ts")).showShelf();`);
    const list = shot.page.getByRole("tree", { name: "Shelved changes" });
    const first = list.getByRole("treeitem").filter({ hasText: "Cart quantities" }).first();
    await first.waitFor();
    await first.click();
    await shot.settle(300);
    await first.hover();
    await shot.settle();
    await shot.save(bottomPanel(shot));
  } finally {
    rmSync(join(storefront, ".git/nibtree-shelf"), { recursive: true, force: true });
  }
});

define(
  "github-share-dialog",
  async (shot) => {
    await inApp(shot, `await (await imp("/src/lib/views/github/githubActions.ts")).shareProjectOnGitHub();`);
    const dialog = topDialog(shot);
    await dialog.locator("label.field", { hasText: "Repository name" }).waitFor();
    await dialog
      .locator("label.field", { hasText: "Description" })
      .locator("input")
      .fill("Shared colors and spacing for Acme apps");
    await shot.settle(300);
    await saveDialog(shot, dialog);
  },
  () =>
    twoFolderScenario({
      github: { account: signedInAccount },
      state: { activeRepos: { [`${acme}\n${designSystem}`]: designSystem } },
    }),
);

define(
  "github-gist-dialog",
  async (shot) => {
    await shot.openFile(cartTs());
    await clickLine(shot, "/** Sets the quantity");
    await shot.page.keyboard.press("Home");
    for (let line = 0; line < 11; line++) {
      await shot.page.keyboard.press("Shift+ArrowDown");
    }
    await inApp(shot, `await (await imp("/src/lib/views/github/githubActions.ts")).createGist();`);
    const dialog = topDialog(shot);
    await dialog.locator("label.field", { hasText: "Description" }).locator("input").fill("Cart quantity helper");
    await shot.settle(300);
    await saveDialog(shot, dialog);
  },
  () => ({ github: { account: signedInAccount }, settings: { currentLineBlame: false } }),
);

const worktreeFix = () => join(demo, "storefront-fix-tax-rates");
const worktreeReview = () => join(demo, "storefront-review");

/** Two linked worktrees outside the scanned acme folder, so no other shot lists them as repositories. */
function addDemoWorktrees(): void {
  const git = (...args: string[]) => execFileSync("git", ["-C", storefront, ...args], { stdio: "ignore" });
  git("worktree", "add", "-q", worktreeFix(), "fix/tax-rates");
  git("worktree", "add", "-q", "--detach", worktreeReview(), "HEAD~3");
  git("worktree", "lock", "--reason", "On a removable disk", worktreeReview());
}

function removeDemoWorktrees(): void {
  const git = (...args: string[]) => {
    try {
      execFileSync("git", ["-C", storefront, ...args], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  };
  git("worktree", "unlock", worktreeReview());
  git("worktree", "remove", "--force", worktreeReview());
  git("worktree", "remove", "--force", worktreeFix());
  git("worktree", "prune");
}

define(
  "worktrees-section",
  async (shot) => {
    addDemoWorktrees();
    try {
      await openBranches(shot);
      const heading = sidebarRow(shot, /^\s*Worktrees/);
      await heading.waitFor();
      await heading.scrollIntoViewIfNeeded();
      const last = shot.page.locator("aside[aria-label=Left\\ panel] [role=treeitem]", { hasText: "locked" }).last();
      await last.waitFor();
      await heading.hover();
      await shot.settle();
      const sidebar = await shot.page.locator("aside[aria-label=Left\\ panel]").boundingBox();
      const stashes = await sidebarRow(shot, /^\s*Stashes/).boundingBox();
      const lastBox = await last.boundingBox();
      if (!sidebar || !lastBox || !stashes) {
        throw new Error("worktrees-section: the section is not visible");
      }
      const top = Math.max(sidebar.y, stashes.y - 8);
      await shot.save({ x: sidebar.x, y: top, width: sidebar.width, height: lastBox.y + lastBox.height + 12 - top });
    } finally {
      removeDemoWorktrees();
    }
  },
  () => ({ state: { sidebarWidth: 400 } }),
);

define("worktrees-new-dialog", async (shot) => {
  await inApp(shot, `(await imp("/src/lib/views/git/worktrees/worktreeActions.ts")).openNewWorktreeDialog();`);
  const dialog = topDialog(shot);
  await dialog.waitFor();
  await dialog.locator("label.field", { hasText: "Branch name" }).locator("input").fill("feature/wishlist");
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

// AI panel: the demo's projects with storefront's worktrees; agents are the demo's stand-in only.
function aiScenario(extra: Scenario = {}): Scenario {
  return {
    agents: true,
    ...extra,
    state: { explorerOpen: true, rightPanel: "ai", explorerWidth: 300, ...(extra.state ?? {}) },
  };
}

/** An agent's row in the AI panel: a tree item with no buttons (project rows and worktree heads have some). */
const AGENT_ROW = '[role="treeitem"]:not(:has(button))';

function aiPanel(shot: Shot): Locator {
  return shot.page.locator("aside[aria-label=Right\\ panel]");
}

/** Starts the stand-in agent in a worktree row of the AI panel, through the row's + menu. */
async function startDemoAgent(shot: Shot, worktreeLabel: string): Promise<void> {
  const row = aiPanel(shot).getByRole("treeitem").filter({ hasText: worktreeLabel }).first();
  await row.waitFor();
  await row.hover();
  await row.locator('button[aria-label^="Start an agent"]').click();
  await shot.menu().getByText("Claude Code", { exact: true }).click();
}

define(
  "ai-panel",
  async (shot) => {
    addDemoWorktrees();
    try {
      // The panel read the worktrees when it opened, before this shot added them.
      await aiPanel(shot).getByRole("button", { name: "Refresh", exact: true }).click();
      await aiPanel(shot).getByRole("treeitem").filter({ hasText: "fix/tax-rates" }).first().waitFor();
      await startDemoAgent(shot, "fix/tax-rates");
      // The terminal may draw with the GPU, so its text is not in the page: the panel says when the agent runs.
      await aiPanel(shot)
        .locator(AGENT_ROW + ' [aria-label="Ready"]')
        .waitFor();
      // Ready comes as the process starts; give it a moment to print before typing.
      await shot.page.waitForTimeout(800);
      await shot.page.keyboard.type("Update the tax rates for 2026");
      await shot.page.keyboard.press("Enter");
      await aiPanel(shot)
        .locator(AGENT_ROW + ' [aria-label="Working"]')
        .waitFor();
      await shot.page.mouse.move(640, 790);
      await shot.settle(500);
      await shot.save(await shot.clipAround([shot.page.locator("main.main"), aiPanel(shot)]));
    } finally {
      removeDemoWorktrees();
    }
  },
  () => aiScenario({ settings: { aiPermissionMode: "normal" }, viewport: { width: 1280, height: 560 } }),
);

define(
  "ai-new-tab",
  async (shot) => {
    await startDemoAgent(shot, "main");
    await aiPanel(shot)
      .locator(AGENT_ROW + ' [aria-label="Ready"]')
      .waitFor();
    const plus = shot.page.locator(".tab-strip .new-tab").first();
    await plus.click();
    await shot.menu().waitFor();
    await shot.settle();
    const tab = shot.page.locator(".tab-strip .tab").first();
    await shot.save(await shot.clipAround([tab, plus, shot.menu()], { top: 0, left: 0, right: 120, bottom: 16 }));
  },
  () => aiScenario({ settings: { aiPermissionMode: "normal" } }),
);

/** Opens New Task from storefront's + in the AI panel and fills it in: a race of two agents with a prompt. */
async function fillNewTask(shot: Shot): Promise<Locator> {
  const project = aiPanel(shot).getByRole("treeitem").filter({ hasText: "storefront" }).first();
  await project.hover();
  await project.locator('button[aria-label^="New task"]').click();
  const dialog = shot.page.getByRole("dialog");
  await dialog.getByText("New Task", { exact: true }).waitFor();
  await dialog.getByPlaceholder("Fix the login race").fill("Round tax to cents");
  await dialog.getByLabel("Agent 1", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Add Agent to Race" }).click();
  await dialog
    .getByPlaceholder("What should the agents do?")
    .fill("Round every tax amount to whole cents and add tests.");
  return dialog;
}

define(
  "ai-new-task",
  async (shot) => {
    const dialog = await fillNewTask(shot);
    await shot.page.mouse.move(5, 790);
    await shot.settle();
    await shot.save(dialog);
  },
  () => aiScenario({ settings: { aiPermissionMode: "normal" } }),
);

define(
  "ai-usage",
  async (shot) => {
    const usage = shot.page.locator('.status-bar [aria-label="AI usage"]');
    await usage.locator("button").first().waitFor();
    await usage.locator("button").first().click();
    const details = shot.page.locator('[role="dialog"][aria-label="AI usage details"]');
    await details.waitFor();
    await shot.page.mouse.move(5, 300);
    await shot.settle();
    await shot.save(await shot.clipAround([usage, details], { top: 12, left: 24, right: 12, bottom: 0 }));
  },
  () => ({ aiUsage: true }),
);

define(
  "ai-agent-command",
  async (shot) => {
    const dialog = await openSettings(shot, "AI");
    await dialog.getByText("1 of 9 found on your PATH.").waitFor();
    const head = dialog.locator("[aria-expanded]", { hasText: "Claude Code" }).first();
    await head.click();
    await dialog.getByLabel("Claude Code extra arguments").fill("--model opus");
    await dialog.getByLabel("Claude Code extra arguments").press("Tab");
    // The Settings list scrolls: bring the opened agent to the top of it.
    await head.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await shot.settle();
    await shot.page.mouse.move(5, 790);
    await shot.save(
      await shot.clipAround([head, dialog.getByRole("button", { name: "Reset to Default", exact: true })], {
        top: 8,
        left: 12,
        right: 12,
        bottom: 12,
      }),
    );
  },
  () => aiScenario({ state: { explorerOpen: false } }),
);

define(
  "memory-terminals",
  async (shot) => {
    await startDemoAgent(shot, "main");
    await aiPanel(shot)
      .locator(AGENT_ROW + ' [aria-label="Ready"]')
      .waitFor();
    await startDemoAgent(shot, "main");
    await aiPanel(shot)
      .locator(AGENT_ROW + ' [aria-label="Ready"]')
      .nth(1)
      .waitFor();
    await newTerminal(shot);
    const memory = shot.page.locator("footer.status-bar").getByRole("button", { name: /^Memory / });
    await memory.click();
    const terminals = shot.page.locator('[aria-label="Terminal memory"]');
    await terminals.locator(".row").nth(2).waitFor();
    await shot.page.mouse.move(5, 300);
    await shot.settle();
    await shot.save(
      await shot.clipAround([memory, shot.page.locator('[role="dialog"][aria-label="Memory usage"]')], {
        top: 12,
        left: 24,
        right: 12,
        bottom: 0,
      }),
    );
  },
  () =>
    aiScenario({
      ...terminalScenario({ settings: { aiPermissionMode: "normal" } }),
      terminalMemory: [412 * 1024 * 1024, 268 * 1024 * 1024, 6 * 1024 * 1024],
    }),
);

define(
  "keep-awake",
  async (shot) => {
    const button = shot.page.locator('.status-bar button[aria-label^="Keep computer awake"]');
    await button.click();
    const menu = shot.page.locator('[role="menu"][aria-label="Keep computer awake"]');
    await menu.waitFor();
    await shot.page.mouse.move(5, 300);
    await shot.settle();
    await shot.save(await shot.clipAround([button, menu], { top: 12, left: 40, right: 12, bottom: 0 }));
  },
  () => ({ settings: { computerAwakeMode: "agent" } }),
);

define(
  "ai-permission",
  async (shot) => {
    await startDemoAgent(shot, "main");
    const dialog = shot.page.getByRole("dialog");
    await dialog.getByText("How Should AI Agents Work?").waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.settle();
    await shot.save(dialog);
  },
  () => aiScenario(),
);

define(
  "ai-settings",
  async (shot) => {
    const dialog = await openSettings(shot, "AI");
    await dialog.getByText("1 of 9 found on your PATH.").waitFor();
    await shot.page.mouse.move(5, 790);
    await shot.settle();
    await shot.save(dialog);
  },
  () => aiScenario({ state: { explorerOpen: false } }),
);

define(
  "submodules-changes",
  async (shot) => {
    const changes = shot.page
      .getByRole("group", { name: "shop-app", exact: true })
      .getByRole("region", { name: "Changes", exact: true });
    const row = changes.getByRole("option").filter({ hasText: "acme" }).first();
    await row.waitFor();
    await row.click({ button: "right" });
    await shot.menu().waitFor();
    await shot.settle();
    const sidebar = shot.page.locator("aside[aria-label=Left\\ panel]");
    const panel = await shot.clipPanel(sidebar, [shot.menu(), row], 16);
    const across = await shot.clipAround([sidebar, shot.menu()], { right: 12 });
    await shot.save({ x: across.x, width: across.width, y: panel.y, height: panel.height });
  },
  () => ({ launch: { mode: "app", repoPath: shopApp }, state: { activeRepos: {}, sidebarWidth: 360 } }),
);

define("submodules-add-dialog", async (shot) => {
  await inApp(shot, `(await imp("/src/lib/views/git/submodules/submoduleActions.ts")).openAddSubmoduleDialog();`);
  const dialog = topDialog(shot);
  await dialog.waitFor();
  await dialog
    .locator("label.field", { hasText: "Repository URL" })
    .locator("input")
    .fill("https://github.com/acme/themes.git");
  await dialog.locator("label.field", { hasText: "Branch to follow" }).locator("input").fill("main");
  await shot.settle(300);
  await saveDialog(shot, dialog);
});

const lfsInstalled = {
  version: "git-lfs/3.6.1 (GitHub; darwin arm64; go 1.23.3)",
  used: true,
  patterns: ["*.png"],
  files: ["assets/hero.png"],
};

define(
  "lfs-diff",
  async (shot) => {
    await shot.page
      .getByRole("group", { name: "media-site", exact: true })
      .getByRole("region", { name: "Staged" })
      .getByText("hero.png")
      .click();
    await shot.page
      .getByRole("region", { name: "Diff", exact: true })
      .first()
      .getByText("Stored in Git LFS")
      .first()
      .waitFor();
    await shot.settle(500);
    await shot.page.mouse.move(640, 790);
    await shot.save();
  },
  () => ({
    launch: { mode: "app", repoPath: mediaSite },
    state: { activeRepos: {}, explorerOpen: false },
    lfsStatus: lfsInstalled,
    localStorage: { "nibtree.lfs.installNoticeShown": "1" },
  }),
);

define(
  "lfs-not-installed",
  async (shot) => {
    const dialog = topDialog(shot);
    await dialog.getByText("Git LFS Is Not Installed").waitFor();
    await shot.settle(300);
    await saveDialog(shot, dialog);
  },
  () => ({
    launch: { mode: "app", repoPath: mediaSite },
    state: { activeRepos: {} },
    lfsStatus: { version: null, used: true, patterns: ["*.png"], files: [] },
  }),
);

// ---------------------------------------------------------------------------------------------
// MCP, workspaces

function mcpRunning(): Scenario {
  const now = Date.now();
  return {
    settings: { mcpEnabled: true, mcpPort: 48731 },
    mcpActivity: [
      { tool: "git_status", at: now - 95000, durationMs: 12, ok: true, error: null, client: "mcp" },
      { tool: "get_app_state", at: now - 61000, durationMs: 4, ok: true, error: null, client: "cli" },
      {
        tool: "git_push",
        at: now - 20000,
        durationMs: 1,
        ok: false,
        error: "This tool is turned off in Nibtree (Help > Available MCP Tools).",
        client: "mcp",
      },
    ],
  };
}

define(
  "mcp-tools-dialog",
  async (shot) => {
    await inApp(shot, `(await imp("/src/lib/mcp/mcpStore.svelte.ts")).mcpStore.openToolsDialog();`);
    const dialog = topDialog(shot);
    await dialog
      .getByText(/tools on/)
      .first()
      .waitFor();
    await shot.settle(500);
    await saveDialog(shot, dialog);
  },
  mcpRunning,
);

define(
  "workspace-opening",
  async (shot) => {
    const card = shot.page.getByText("Big folders take a moment", { exact: false }).first();
    await card.waitFor({ timeout: 15000 });
    const box = shot.page.locator('.card[role="status"]', { has: card }).first();
    await shot.page.mouse.move(5, 790);
    await shot.save(await shot.clipAround([box], 48), { settle: false });
  },
  () => ({ hold: { open_workspace: 9000 }, noWait: true }),
);

// NEW-SHOTS-END

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    console.log(shots.map((spec) => spec.name).join("\n"));
    return;
  }
  const wanted = new Set(args.map((arg) => arg.replace(/\.png$/, "")));
  const unknown = [...wanted].filter((name) => !shots.some((spec) => spec.name === name));
  if (unknown.length > 0) {
    throw new Error(`Unknown screenshot: ${unknown.join(", ")}. Try --list.`);
  }
  const selected = wanted.size > 0 ? shots.filter((spec) => wanted.has(spec.name)) : shots;

  try {
    await fetch(DEV_SERVER);
  } catch {
    throw new Error(`No dev server on ${DEV_SERVER}. Start the app with GM_IPC_BRIDGE=1 bun tauri dev.`);
  }
  buildDemo();
  bridgePid = appPid();
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await webkit.launch();
  const failed: string[] = [];
  try {
    for (const spec of selected) {
      const started = Date.now();
      process.stdout.write(`${spec.name} ... `);
      // One retry: a dev server reload or a slow first response can break a single attempt.
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        let context: BrowserContext | null = null;
        let page: Page | null = null;
        try {
          const opened = await openApp(browser, spec.name, spec.scenario?.() ?? {});
          context = opened.context;
          page = opened.shot.page;
          await spec.run(opened.shot);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (page && process.env.GM_SHOTS_FAILURES) {
            // What the page looked like when the shot failed, for debugging a define().
            await page
              .screenshot({ path: join(process.env.GM_SHOTS_FAILURES, `${spec.name}-${attempt}.png`) })
              .catch(() => undefined);
          }
          if (attempt === 1) {
            process.stdout.write("retrying ... ");
          }
        } finally {
          if (page) {
            await closeTerminals(page);
          }
          await context?.close();
        }
      }
      if (lastError) {
        failed.push(spec.name);
        console.log("FAILED");
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        console.error(`  ${message}`);
        if (/No app window answered|did not answer through the bridge/.test(message)) {
          // macOS pauses a web view whose window is hidden, so every later shot would fail too.
          console.error(
            "\nThe app window stopped answering. Keep the Nibtree window visible (not minimized or covered) while shots run.",
          );
          break;
        }
      } else {
        const size = statSync(join(OUT_DIR, `${spec.name}.png`)).size;
        console.log(`${(size / 1024).toFixed(0)} KB, ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
