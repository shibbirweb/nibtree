// The Git menu UI tests' workspace: new repositories, a home folder of their own, the browser version serving them,
// and plain git to set up and check. harness.ts adds the page. See docs/wiki/developer/Git-Menu-UI-Tests.md.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Options {
  /** The nibtree-browser program. */
  binary: string;
  /** The built page (bun run build). */
  assets: string;
}

export const TOKEN = "ui-test";
const GITCONFIG = `[user]
\tname = Test User
\temail = test@example.com
[init]
\tdefaultBranch = main
[commit]
\tgpgsign = false
[tag]
\tgpgsign = false
[protocol "file"]
\tallow = always
`;

/** Repositories in a temporary folder: play is one commit behind origin, which the other clone pushed to. */
export class Workspace {
  readonly root: string;
  readonly home: string;
  readonly repo: string;
  readonly origin: string;
  readonly other: string;
  private server: ChildProcess | null = null;
  private readonly env: NodeJS.ProcessEnv;
  /** The tests' own git: polling `git status` must not take the index lock the app needs ("could not write index"). */
  private readonly checkEnv: NodeJS.ProcessEnv;

  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "nibtree-ui-")));
    this.home = join(this.root, "home");
    this.repo = join(this.root, "play");
    this.origin = join(this.root, "origin.git");
    this.other = join(this.root, "other");
    mkdirSync(this.home);
    writeFileSync(join(this.home, ".gitconfig"), GITCONFIG);
    this.env = { ...process.env, HOME: this.home, USERPROFILE: this.home, GIT_CONFIG_NOSYSTEM: "1" };
    this.checkEnv = { ...this.env, GIT_OPTIONAL_LOCKS: "0" };
    this.gitIn(this.root, ["init", "-q", "--bare", "origin.git"]);
    this.gitIn(this.root, ["clone", "-q", "origin.git", "play"]);
    this.write("notes.txt", "line 1\nline 2\nline 3\n");
    this.write("README.md", "# Play\n");
    this.gitIn(this.repo, ["add", "."]);
    this.gitIn(this.repo, ["commit", "-q", "-m", "first commit"]);
    this.gitIn(this.repo, ["push", "-q", "-u", "origin", "main"]);
    this.gitIn(this.root, ["clone", "-q", "origin.git", "other"]);
    this.commitIn(this.other, "other.txt", "from another clone\n", "change from another clone", true);
  }

  /** Starts nibtree-browser on play, on a free port; returns its address. */
  protected startServer(options: Options): Promise<string> {
    const args = [this.repo, "--no-open", "--port", "0", "--token", TOKEN, "--assets", options.assets];
    const server = spawn(options.binary, args, { env: this.env, stdio: ["ignore", "pipe", "pipe"] });
    this.server = server;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("nibtree-browser did not start")), 30_000);
      let output = "";
      server.stdout!.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = /running at (\S+)/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      server.on("exit", (code) => reject(new Error(`nibtree-browser exited with ${code}: ${output}`)));
    });
  }

  /** Stops the server and deletes the folder. */
  protected dispose(): void {
    this.server?.kill();
    rmSync(this.root, { recursive: true, force: true });
  }

  // --- git and files ---

  gitIn(dir: string, args: string[]): string {
    try {
      const output = execFileSync("git", ["-C", dir, ...args], {
        env: this.checkEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return output.trim();
    } catch (error) {
      // git's own message says why, not just which command failed.
      const stderr = String((error as { stderr?: string }).stderr ?? "").trim();
      throw new Error(`git ${args.join(" ")} failed: ${stderr.split("\n").slice(-3).join(" / ")}`);
    }
  }

  /** Plain git for checks: the output, or "" when git fails. */
  git(args: string[], dir = this.repo): string {
    try {
      return this.gitIn(dir, args);
    } catch {
      return "";
    }
  }

  write(path: string, text: string, dir = this.repo): void {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  read(path: string, dir = this.repo): string {
    return existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf8") : "<missing>";
  }

  exists(path: string, dir = this.repo): boolean {
    return existsSync(join(dir, path));
  }

  commitIn(dir: string, path: string, text: string, message: string, push = false): void {
    this.write(path, text, dir);
    this.gitIn(dir, ["add", path]);
    this.gitIn(dir, ["commit", "-q", "-m", message]);
    if (push) {
      this.gitIn(dir, ["push", "-q"]);
    }
  }

  /** The other clone pushes a new commit; returns the remote's new head. */
  remoteCommit(message: string): string {
    this.gitIn(this.other, ["pull", "-q", "--no-rebase"]);
    this.commitIn(this.other, `${message.replace(/\W+/g, "-")}.txt`, `${message}\n`, message, true);
    return this.git(["rev-parse", "main"], this.origin);
  }
}
