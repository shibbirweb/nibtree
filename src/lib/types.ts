// TypeScript mirrors of the Rust DTOs (serde camelCase).

export type Eol = "lf" | "crlf";

export interface AppError {
  kind: "git" | "io" | "command" | "invalid";
  message: string;
}

export type LaunchMode =
  | { mode: "app"; repoPath: string | null }
  | { mode: "mergeTool"; base: string; local: string; remote: string; merged: string };

export interface RepoInfo {
  root: string;
  name: string;
  /** Repo root relative to the workspace root; "" for the root itself or an enclosing repo. */
  relativePath: string;
  /** A submodule of the repository enclosing it. */
  submodule?: boolean;
  /** A linked work tree (`git worktree add`). */
  worktree?: boolean;
}

/** A saved `.nibtree-workspace` (or `.code-workspace`) file. */
export interface WorkspaceFile {
  name: string;
  folders: string[];
  /** Listed folders that no longer exist. */
  missing: string[];
}

export interface WorkspaceInfo {
  root: string;
  name: string;
  repos: RepoInfo[];
}

export type ChangeKind = "added" | "modified" | "deleted" | "renamed" | "typechange" | "untracked";

export interface FileStatus {
  path: string;
  origPath: string | null;
  staged: ChangeKind | null;
  unstaged: ChangeKind | null;
  conflicted: boolean;
  /** Set for a submodule: what changed in it, like `git status`. */
  submodule?: SubmoduleChange | null;
}

export interface HeadInfo {
  branch: string | null;
  shortId: string | null;
  unborn: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export type OpKind = "none" | "merge" | "rebase" | "cherryPick" | "revert" | "other";

export interface OpState {
  kind: OpKind;
  description: string;
  oursLabel: string;
  theirsLabel: string;
}

export interface RepoStatus {
  head: HeadInfo;
  op: OpState;
  /** While a `git bisect` runs: a fingerprint of its log, so every mark changes the status. */
  bisect: string | null;
  files: FileStatus[];
}

/** `get_status`: `status` is null when the hash the caller sent still matched. */
export interface StatusSnapshot {
  hash: string;
  status: RepoStatus | null;
}

export type DiffArea = "staged" | "unstaged";

export interface FileDiff {
  path: string;
  original: string;
  modified: string;
  originalEol: Eol;
  modifiedEol: Eol;
  binary: boolean;
  tooLarge: boolean;
  /** Set when either side is a Git LFS pointer. */
  lfs?: LfsDiff | null;
  /** Changed lines from the backend's diff, refined to characters by the diff view. */
  hunks?: LineHunk[];
  /** Staged and unstaged diffs: which versions of the sides these are (see getFileDiffIfChanged). */
  version?: string | null;
}

/** `[oldStart, oldEnd, newStart, newEnd]`: half-open 0-based line ranges. */
export type LineHunk = [number, number, number, number];

/** Stage and Discard work on the unstaged diff, Unstage on the staged one. */
export type LineAction = "stage" | "unstage" | "discard";

/** Selected lines of a diff: half-open 0-based ranges of the old (left) and new (right) side. */
export interface LineSelection {
  oldLines: [number, number][];
  newLines: [number, number][];
}

/** The result of `applySelectedLines`. */
export interface LinesOutcome {
  /** How many changed lines moved. */
  lines: number;
  /** Discard only: the patch that was taken back, for Undo. */
  patch: string | null;
}

/** The HEAD commit and the file's object that the editor's blame and marks belong to (in HEAD, or the index). */
export interface HeadVersion {
  commitId: string | null;
  blobId: string | null;
}

/** A file as of HEAD (or as staged, from readBaseFile), LF-normalized; empty when it does not exist there. */
export interface HeadFile {
  content: string;
  binary: boolean;
  tooLarge: boolean;
  version: HeadVersion;
}

/** The editor's changes since the last commit (src-tauri/src/commands/editor.rs). */
export interface LineMarks {
  base: HeadVersion;
  marks: { from: number; to: number; kind: "added" | "modified" | "deleted" }[];
}

export interface GitOutput {
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface OpOutcome {
  output: string;
  conflicts: boolean;
}

// Merge

export interface LineRange {
  start: number;
  end: number;
}

export type ChunkKind = "oursOnly" | "theirsOnly" | "bothSame" | "conflict";

export interface MergeChunk {
  id: number;
  kind: ChunkKind;
  base: LineRange;
  ours: LineRange;
  theirs: LineRange;
}

export type FileConflictKind = "bothModified" | "bothAdded" | "deletedByUs" | "deletedByThem";

export interface MergeDocument {
  path: string;
  kind: FileConflictKind;
  binary: boolean;
  base: string;
  ours: string;
  theirs: string;
  oursLabel: string;
  theirsLabel: string;
  eol: Eol;
  ignoreWhitespace: boolean;
  chunks: MergeChunk[];
}

export interface ConflictFile {
  path: string;
  kind: FileConflictKind;
  binary: boolean;
}

export interface ConflictSummary {
  op: OpState;
  files: ConflictFile[];
}

export type Side = "ours" | "theirs";

// Refs, log, stash

export interface LocalBranch {
  name: string;
  isHead: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  shortId: string | null;
}

export interface RemoteBranch {
  name: string;
  remote: string;
  branch: string;
}

export interface Refs {
  local: LocalBranch[];
  remote: RemoteBranch[];
  tags: string[];
  remotes: string[];
}

/** `get_refs_snapshot`: `refs` is null when the fingerprint the caller sent still matched. */
export interface RefsSnapshot {
  /** Covers the refs, stashes, remotes and worktrees: unchanged means none of them changed. */
  fingerprint: string;
  /** Changes exactly when the Log may show something else. */
  tips: string;
  refs: Refs | null;
}

export type RefKind = "head" | "local" | "remote" | "tag";

export interface RefLabel {
  name: string;
  kind: RefKind;
}

export interface CommitSummary {
  id: string;
  shortId: string;
  summary: string;
  authorName: string;
  authorEmail: string;
  time: number;
  parents: string[];
  refs: RefLabel[];
}

/** `get_log`: `commits` is null when the tips the caller sent still matched. */
export interface LogPage {
  tips: string;
  commits: CommitSummary[] | null;
}

export interface ChangedFile {
  path: string;
  origPath: string | null;
  status: "added" | "deleted" | "renamed" | "copied" | "typechange" | "modified";
}

export interface CommitDetails {
  id: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorTime: number;
  committerName: string;
  committerTime: number;
  parents: string[];
  /** Changes against the first parent. */
  files: ChangedFile[];
  /** A merge's changes against its second and later parents; empty for other commits. */
  laterParentFiles: ChangedFile[][];
  /** A merge's files that differ from every parent: the ones the merge combined or resolved. */
  mergedFiles: ChangedFile[];
}

export interface StashEntry {
  index: number;
  message: string;
  shortId: string;
}

export type ResetMode = "soft" | "mixed" | "hard" | "keep";

// Git menu: pull, push, patches, remotes, clone, file history

/** How a pull integrates: a merge (--no-rebase), a rebase or a fast-forward only. */
export type PullMode = "merge" | "rebase" | "ffOnly";

/** Commits the current branch would push. */
export interface OutgoingCommits {
  commits: CommitSummary[];
  /** The remote branch they are counted against, e.g. "origin/main"; null when it does not exist yet (every commit on no remote). */
  base: string | null;
  /** More commits than were listed. */
  truncated: boolean;
}

/** Which changes a patch holds: staged (HEAD to index), unstaged (index to work tree) or both (HEAD to work tree). */
export type PatchSource = "staged" | "unstaged" | "all";

export interface RemoteInfo {
  name: string;
  fetchUrl: string | null;
  /** The push URL; equals `fetchUrl` unless a separate one is configured. */
  pushUrl: string | null;
  /** The remote's default branch from refs/remotes/NAME/HEAD, e.g. "main"; null when unknown. */
  defaultBranch: string | null;
}

export interface FileHistoryEntry {
  commit: CommitSummary;
  /** The file's repo-relative path in this commit (it changes across renames). */
  path: string;
  origPath: string | null;
  status: "added" | "deleted" | "renamed" | "copied" | "typechange" | "modified";
}

export interface LineHistoryEntry {
  commit: CommitSummary;
  /** The commit's diff of the traced lines (`git log -L`), possibly cut short. */
  patch: string;
  truncated: boolean;
}

// Interactive rebase

export type RebaseAction = "pick" | "reword" | "edit" | "squash" | "fixup" | "drop";

export interface RebaseCommit {
  id: string;
  shortId: string;
  summary: string;
  /** The full message. */
  message: string;
  authorName: string;
  authorEmail: string;
  time: number;
  isMerge: boolean;
}

export interface RebasePlan {
  /** Oldest first: base..HEAD. */
  commits: RebaseCommit[];
  /** The parent commit the rebase starts on; null rebases from the root. */
  base: string | null;
  /** A remote branch (the upstream first) that already has commits of the range. */
  pushedTo: string | null;
  /** Uncommitted changes to tracked files. */
  dirty: boolean;
  /** The todo with its label, reset and merge lines when the range has merges (`--rebase-merges`); empty when linear. */
  steps: RebaseStep[];
  /** A branch the commits go onto (the Rebase dialog's --interactive), for the title; null names the base commit. */
  ontoName: string | null;
}

export type RebaseStepKind = "label" | "reset" | "pick" | "merge";

/** One line of a todo that keeps merges. */
export interface RebaseStep {
  kind: RebaseStepKind;
  /** Pick and merge: the commit. Reset: the commit it resets to (also set with a label, except for "onto"). */
  commitId: string | null;
  /** Label: its name. Reset: the label it resets to. */
  label: string | null;
  /** Merge: labels (or commit ids outside the range) of the parents merged in. */
  parents: string[];
}

export interface RebaseEntry {
  action: RebaseAction;
  commitId: string;
  /** Reword: the new message; squash: the combined message of its group. */
  message: string | null;
}

/** A file at a revision (left) against the work tree (right). */
export interface RevisionDiff {
  diff: FileDiff;
  existsInRevision: boolean;
  /** The full id of the commit the revision resolved to. */
  commitId: string;
}

// Compare any two files

/** One side of Compare Files: an absolute file path, or text (an unsaved buffer, the clipboard). */
export interface CompareSide {
  filePath: string | null;
  text: string | null;
}

export interface FileCompare {
  diff: FileDiff;
  /** Both sides' versions, passed back as `knownVersion`. */
  version: string;
  leftMissing: boolean;
  rightMissing: boolean;
  /** The bytes are equal; null when a side was too large to read. */
  identical: boolean | null;
}

// Blame

export interface BlameCommit {
  id: string;
  shortId: string;
  authorName: string;
  authorEmail: string;
  /** Seconds since the epoch. */
  authorTime: number;
  summary: string;
  uncommitted: boolean;
}

export interface BlameInfo {
  commits: BlameCommit[];
  /**
   * `[length, commit, originalStart]` for every run of consecutive lines from one commit (an
   * index into `commits`) whose lines in that commit (0-based, from `originalStart`) are
   * consecutive too, flattened in order.
   */
  runs: number[];
}

// Memory

export interface ProcessMemory {
  pid: number;
  name: string;
  label: string;
  bytes: number;
}

export interface MemoryUsage {
  totalBytes: number;
  processes: ProcessMemory[];
  /** Web view helpers matched by start time (the app was started from a terminal). */
  approximate: boolean;
}

/** One terminal's memory: its shell and everything the shell started (terminal_memory.rs). */
export interface TerminalMemory {
  terminalId: number;
  bytes: number;
  processes: number;
}

/** The real OS for bug reports; the web view's user agent freezes the macOS version. */
export interface OsInfo {
  /** "macOS", "Windows", or the Linux distribution name. */
  name: string;
  version: string | null;
}

// Integrated terminal

/** Where a project's scripts come from (src-tauri/src/scripts). */
export type ScriptKind = "npm" | "composer" | "make" | "deno" | "just";

/** One file with runnable scripts: package.json, composer.json, a Makefile, deno.json or a justfile. */
export interface ScriptSource {
  kind: ScriptKind;
  /** Absolute path of the file. */
  filePath: string;
  /** Absolute folder the scripts run in. */
  folderPath: string;
  /** The workspace folder it was found under. */
  workspaceFolder: string;
  /** Program that runs it: npm, yarn, pnpm or bun for package.json, else composer, make, deno or just. */
  runner: string;
  packageName: string | null;
  scripts: ProjectScript[];
  /** Why the file could not be read; its scripts are then empty. */
  error: string | null;
  /** package.json only: the Node version the project asks for, if it says. */
  nodeVersion: NodeWanted | null;
}

/** A Node version asked for by .nvmrc, .node-version, .tool-versions or package.json. */
export interface NodeWanted {
  /** As written: "18", "v20.11.1", "lts/iron", ">=18 <21". */
  spec: string;
  /** ".nvmrc", "package.json engines.node"... */
  source: string;
  filePath: string;
}

/** A Node version installed by a version manager (src-tauri/src/node_versions.rs). */
export interface NodeInstall {
  /** "20.11.1", without the v. */
  version: string;
  /** Put first on PATH to use this version. */
  binDir: string;
  /** "nvm", "Herd", "fnm", "Volta", "asdf", "mise", "nodenv", "n" or "Homebrew". */
  manager: string;
}

export interface ProjectScript {
  name: string;
  /** What it runs, for the tooltip. */
  command: string;
  /** 1-based line of its name in the file; 0 when unknown. */
  line: number;
}

/** A shell the terminal can start, found on this machine (src-tauri/src/terminal.rs). */
export interface ShellProfile {
  /** Stable id, the shell's absolute path, e.g. "/bin/zsh". */
  id: string;
  /** Short name shown in menus and tabs, e.g. "zsh", "bash", "PowerShell". */
  name: string;
  path: string;
  /** Arguments it starts with, e.g. ["-l"] for a login shell. */
  args: string[];
  /** The user's login shell ($SHELL), used when no default is set. */
  isDefault: boolean;
}

/** One rate-limit window of an AI agent (ai_usage). */
export interface UsageWindow {
  /** 0 to 100. */
  usedPercent: number;
  windowMinutes: number;
  /** ms since the epoch. */
  resetsAt: number | null;
}

/** An AI agent's usage of its plan's limits, for the status bar. */
export interface ProviderUsage {
  provider: string;
  status: "ok" | "signedOut" | "noData" | "error";
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  /** Weekly limits of single models, such as Claude Code's Fable weekly limit. */
  modelWeekly: { model: string; window: UsageWindow }[];
  plan: string | null;
  message: string | null;
}

/** What prepare_worktree did in a new worktree (git/worktree_prepare.rs). */
export interface PrepareReport {
  copied: string[];
  linked: string[];
  skipped: { path: string; reason: string }[];
}

/** A program found on the login shell's PATH (find_agent_programs). */
export interface FoundProgram {
  program: string;
  path: string;
}

export interface TerminalInfo {
  terminalId: number;
  /** Process id of the shell, when the platform reports one. */
  pid: number | null;
  shell: ShellProfile;
  /** The folder it started in. */
  cwd: string;
}

/** The last message on a terminal's output channel, once its shell exited (or was closed). */
export interface TerminalExitMessage {
  /** null when the process was killed or the code is unknown. */
  exit: number | null;
}

/** A terminal's output channel: raw output bytes, then the exit. */
export type TerminalOutputMessage = ArrayBuffer | TerminalExitMessage;

// File explorer

export interface DirEntry {
  /** The entry's name; its path is the listed folder joined with it. */
  name: string;
  isDir: boolean;
  ignored: boolean;
  /** The folder is the root of a git repository. */
  isRepo: boolean;
}

/** One folder anywhere on the app's machine, for the browser app's folder and file picker (`browse_folder`). */
export interface BrowseListing {
  folderPath: string;
  /** Null at a root (`/`, `C:/`). */
  parentPath: string | null;
  homePath: string;
  /** Folders first, then files, by name. */
  entries: BrowseEntry[];
}

export interface BrowseEntry {
  name: string;
  isDir: boolean;
  /** A dot name, hidden until asked. */
  hidden: boolean;
}

/** One folder of a `list_directories` answer. */
export interface FolderListing {
  /** As asked: relative to the workspace folder, "" for the folder itself. */
  dirPath: string;
  /** The folder's state, passed back in `known` next time. */
  stamp: string;
  /** The folder still has the known stamp: it was not read and `entries` is empty. */
  unchanged: boolean;
  entries: DirEntry[];
  truncated: boolean;
  /** The folder could not be read (deleted, not a folder). */
  error: string | null;
}

/** One entry moved by `file_move`: absolute paths before and after. */
export interface FileMove {
  from: string;
  to: string;
}

export interface FileContent {
  path: string;
  content: string;
  eol: Eol;
  binary: boolean;
  tooLarge: boolean;
  size: number;
  /** The file's state on disk, passed back to readWorktreeFile as `knownVersion`. */
  version: string;
  /** The file still has `knownVersion`: nothing else is filled in and no text is sent. */
  unchanged: boolean;
}

// Image and PDF preview (src-tauri/src/preview_scheme.rs)

/**
 * Where a previewed image or PDF comes from: a work tree file (absolute path), or a file of a
 * repository (repo-relative path) at a revision: `HEAD`, `index`, a full commit id or `<id>^`.
 */
export type PreviewSource =
  { kind: "worktree"; filePath: string } | { kind: "revision"; repoRoot: string; revision: string; filePath: string };

export interface PreviewStat {
  exists: boolean;
  size: number;
  /** Set when the file is too big to preview: the limit in bytes. */
  limit: number | null;
}

// Go to File

export interface FileSearchProgress {
  indexed: number;
  done: boolean;
  /** Indexing stopped at the file cap. */
  truncated: boolean;
}

export interface FileSearchItem {
  /** Absolute path. */
  path: string;
  /** Workspace folder the file was found in. */
  root: string;
  relativePath: string;
  /** Matched code points of `relativePath`, ascending. */
  indices: number[];
  score: number;
}

export interface FileSearchResults {
  items: FileSearchItem[];
  /** Every file that matched; `items` holds the best of them. */
  matched: number;
  indexed: number;
  done: boolean;
  truncated: boolean;
  /** 1-based, from a "name:LINE:COL" query. */
  line: number | null;
  column: number | null;
}

// Search Everywhere: Classes and Symbols

export type SymbolKind =
  | "class"
  | "interface"
  | "trait"
  | "struct"
  | "enum"
  | "type"
  | "protocol"
  | "record"
  | "object"
  | "module"
  | "function"
  | "method"
  | "constant";

/** Which definitions a symbol query lists; "members" is everything but classes. */
export type SymbolScope = "classes" | "all" | "members";

export interface SymbolSearchProgress {
  /** Files looked at so far. */
  files: number;
  symbols: number;
  done: boolean;
  /** Indexing stopped at the symbol cap. */
  truncated: boolean;
}

export interface SymbolSearchItem {
  name: string;
  kind: SymbolKind;
  container: string | null;
  /** Absolute path. */
  path: string;
  root: string;
  relativePath: string;
  /** 1-based. */
  line: number;
  /** 1-based, in UTF-16 code units. */
  column: number;
  /** Matched code points of `name`, ascending. */
  indices: number[];
  /** Matched code points of `container` ("Cart.add" queries). */
  containerIndices: number[];
  score: number;
}

export interface SymbolSearchResults {
  items: SymbolSearchItem[];
  matched: number;
  files: number;
  symbols: number;
  done: boolean;
  truncated: boolean;
}

// Quick Open "@": the symbols of one file

/** A code definition's kind, or a Markdown heading. */
export type OutlineKind = SymbolKind | "heading";

export interface OutlineItem {
  name: string;
  kind: OutlineKind;
  container: string | null;
  /** 1-based. */
  line: number;
  /** 1-based, in UTF-16 code units. */
  column: number;
  /** A heading's level minus one, 1 for a member of a class. */
  depth: number;
}

export interface OutlineResult {
  items: OutlineItem[];
  /** The file's language has a scanner (or is Markdown). */
  supported: boolean;
  /** Capped, or the text was too big to scan. */
  truncated: boolean;
}

// Search Everywhere: Text (Find in Files)

export interface TextSearchOptions {
  matchCase: boolean;
  wholeWords: boolean;
  regex: boolean;
}

export interface TextLineMatch {
  /** 1-based. */
  line: number;
  /** 1-based column of the first match, in UTF-16 code units. */
  column: number;
  /** The line, trimmed around the first match. */
  text: string;
  /** Matches in `text` as UTF-16 [start, end) offsets. */
  ranges: [number, number][];
}

export interface TextFileMatches {
  /** Absolute path. */
  path: string;
  root: string;
  relativePath: string;
  lines: TextLineMatch[];
}

export interface TextSearchBatch {
  /** Files found since the previous batch. */
  files: TextFileMatches[];
  /** The last batch of this search. */
  done: boolean;
  /** Matching lines so far. */
  matches: number;
  filesMatched: number;
  filesSearched: number;
  /** The caps were hit: there are more results than sent. */
  more: boolean;
  error: string | null;
}

// Search Everywhere: Replace in Files

export interface ReplaceRequest {
  query: string;
  options: TextSearchOptions;
  /** Literal, or with Regex on: $1 groups, $& the match, $$ a dollar, and \n \t \r \\ escapes. */
  replacement: string;
  /** Absolute paths to limit the replace to; null replaces in every file. */
  filePaths: string[] | null;
  /** Absolute paths never written (open with unsaved edits). */
  skipPaths: string[];
  /** Only count what would be replaced. */
  preview: boolean;
}

export interface ReplacedFile {
  /** Absolute path. */
  path: string;
  root: string;
  relativePath: string;
  replacements: number;
}

export type ReplaceSkipReason = "unsaved" | "link" | "readOnly";

export interface ReplaceSkippedFile {
  path: string;
  relativePath: string;
  reason: ReplaceSkipReason;
  matches: number;
}

export interface ReplaceFailedFile {
  path: string;
  relativePath: string;
  message: string;
}

export interface ReplaceOutcome {
  files: ReplacedFile[];
  /** Matches replaced in `files`. */
  replacements: number;
  skipped: ReplaceSkippedFile[];
  failed: ReplaceFailedFile[];
  /** Stopped by a cancel; `files` holds what was done. */
  cancelled: boolean;
  preview: boolean;
  /** The query could not be used (an invalid regex). */
  error: string | null;
}

// Events

/** What the watcher saw change in one repository (src-tauri/src/watcher.rs). */
export interface RepoChangedEvent {
  repoPath: string;
  /** HEAD, a branch, tag, remote branch or the stash moved, or a linked worktree changed. */
  refs: boolean;
  /** The repository config changed (remotes, upstreams). */
  config: boolean;
  /** The index changed, or something else in `.git` that status reads. */
  index: boolean;
  /** A merge, rebase, cherry-pick, revert or bisect started, moved on or ended. */
  opState: boolean;
  /** A visible (not ignored) work tree path changed. */
  workTree: boolean;
  /** Entries were created, deleted or renamed, or ignore rules changed. */
  structure: boolean;
  /** A `.gitattributes` file in the work tree changed. */
  attributes: boolean;
}

export interface WorkspaceChangedEvent {
  workspaceRoot: string;
  /** A repository may have appeared or disappeared, so the folder should be rescanned. */
  reposChanged: boolean;
  /** Entries were created, deleted or renamed (or ignore rules changed): listings are out of date. */
  structure: boolean;
  /** Files outside every repository changed; they have no status to follow. */
  outsideRepos: boolean;
}

/** Files open in a tab that changed where no status follows them (git ignores them). */
export interface OpenFilesChangedEvent {
  filePaths: string[];
}

export interface GitProgressEvent {
  repoPath: string;
  line: string;
}

// GitHub (src-tauri/src/github)

export type GitHubAccountSource = "token" | "ghCli";

/** The signed-in GitHub account. The token itself never reaches the webview. */
export interface GitHubAccount {
  host: string;
  login: string;
  name: string | null;
  source: GitHubAccountSource;
  /** Scopes a classic token lacks ("repo", "gist"); empty when unknown. */
  missingScopes: string[];
}

export interface GhCliStatus {
  installed: boolean;
  signedIn: boolean;
}

export interface GitHubShareRequest {
  repositoryName: string;
  private: boolean;
  description: string;
  remoteName: string;
  /** For a repository without commits: commit every file with this message first. */
  initialCommitMessage: string | null;
}

export interface GitHubSharedRepository {
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  remoteName: string;
  branchName: string;
}

export interface GitHubRepositoryInfo {
  fullName: string;
  htmlUrl: string;
  defaultBranch: string | null;
  fork: boolean;
  parent: { fullName: string; owner: string; repo: string; defaultBranch: string | null } | null;
}

export type GitHubSyncKind = "fastForward" | "merge" | "upToDate" | "conflict";

export interface GitHubSyncForkOutcome {
  kind: GitHubSyncKind;
  message: string;
  /** The upstream branch, e.g. "octo:main". */
  baseBranch: string | null;
}

export interface GitHubGistRequest {
  fileName: string;
  description: string;
  public: boolean;
  content: string;
}

export interface GitHubGist {
  id: string;
  htmlUrl: string;
}

// Worktrees, submodules and Git LFS

export interface WorktreeInfo {
  path: string;
  /** Full commit id; null for a bare entry or an unborn branch. */
  head: string | null;
  /** Short branch name; null when detached or bare. */
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason: string | null;
  /** Its folder is gone: Prune removes it. */
  prunable: boolean;
  prunableReason: string | null;
  isMain: boolean;
  /** The work tree the list was read from. */
  isCurrent: boolean;
}

/** A worktree with what the top bar's switcher shows: its changes, upstream, operation and last activity. */
export interface WorktreeSummary extends WorktreeInfo {
  /** Changed files, staged or not, untracked and conflicted ones included. */
  changes: number;
  conflicts: number;
  upstream: string | null;
  ahead: number;
  behind: number;
  op: OpKind;
  /** Milliseconds since 1970: HEAD moving, the index or a changed file, whichever is latest. */
  lastActivity: number | null;
}

/** What a new worktree checks out. */
export type WorktreeBranch =
  | { kind: "existing"; branchName: string }
  | { kind: "new"; branchName: string; baseRef: string }
  | { kind: "detached"; baseRef: string };

export interface SubmoduleChange {
  newCommits: boolean;
  modifiedContent: boolean;
  untrackedContent: boolean;
}

export interface SubmoduleInfo {
  name: string;
  /** Relative to the parent repository's root. */
  path: string;
  url: string | null;
  branch: string | null;
  initialized: boolean;
  recordedId: string | null;
  checkedOutId: string | null;
}

export interface LfsStatus {
  /** `git lfs version` output; null when git-lfs is not installed or was not checked yet. */
  version: string | null;
  /** Some attributes file routes paths through LFS. */
  used: boolean;
  /** The LFS patterns of the root `.gitattributes`. */
  patterns: string[];
  /** Repo-relative paths stored in LFS. */
  files: string[];
  /** The state this answer was read at, passed back as `knownStamp` next time. */
  stamp: string;
  /** Nothing changed since `knownStamp`: no other field is filled in. */
  unchanged: boolean;
}

export interface LfsDiff {
  originalSize: number | null;
  modifiedSize: number | null;
  originalOid: string | null;
  modifiedOid: string | null;
}

// Git Console

/** A git command the app ran (git/cli.rs), credentials masked. */
export interface GitCommandEntry {
  id: number;
  /** Milliseconds since the epoch. */
  startedAt: number;
  repoPath: string;
  /** The arguments after `git`. */
  args: string[];
  running: boolean;
  durationMs: number | null;
  exitCode: number | null;
  success: boolean;
  /** Why git could not run at all. */
  error: string | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

// Shelf

export type ShelvedChange = "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange";

export interface ShelvedFile {
  path: string;
  oldPath: string | null;
  change: ShelvedChange;
  binary: boolean;
  oldId: string | null;
}

/** One shelved change list, stored in .git/nibtree-shelf/<id>.json next to <id>.patch. */
export interface ShelfEntry {
  version: number;
  id: string;
  name: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
  branch: string | null;
  headCommit: string | null;
  files: ShelvedFile[];
}

export interface ShelfFileDiff {
  diff: FileDiff;
  file: ShelvedFile;
  /** The original is gone: only the changed lines and their context show. */
  partial: boolean;
}

// Add to .gitignore

/** The root .gitignore (shared), or .git/info/exclude (this clone only). */
export type IgnoreTarget = "gitignore" | "exclude";

export interface IgnoreOutcome {
  /** Absolute path of the file written. */
  ignoreFile: string;
  added: string[];
  existing: string[];
  /** Tracked files the patterns match: they stay tracked until removed with git rm --cached. */
  trackedPaths: string[];
}

// Merge, Rebase and Commit options; the Branches popup

/** The Merge dialog's options; `message` is the merge commit's (-m). */
export interface MergeOptions {
  noFf: boolean;
  ffOnly: boolean;
  squash: boolean;
  noCommit: boolean;
  message: string | null;
  noVerify: boolean;
}

/** The Rebase dialog's options (not interactive). */
export interface RebaseOptions {
  /** The upstream of `git rebase <upstream>`, or the new base with --onto. */
  onto: string | null;
  /** With --onto: only the commits after it move. */
  upstream: string | null;
  /** The branch to rebase; null is the current one. */
  branchName: string | null;
  useOnto: boolean;
  rebaseMerges: boolean;
  keepEmpty: boolean;
  root: boolean;
  updateRefs: boolean;
}

/** -S, --no-gpg-sign, or neither (commit.gpgSign decides). */
export type GpgSign = "default" | "sign" | "noSign";

export interface CommitOptions {
  signOff: boolean;
  /** "Name <email>"; null keeps the configured author. */
  author: string | null;
  gpgSign: GpgSign;
  noVerify: boolean;
}

/** Compare with Current: commits only one side has, and the files that differ (base left, branch right). */
export interface BranchComparison {
  branchId: string;
  baseId: string;
  /** Newest first. */
  branchOnly: CommitSummary[];
  baseOnly: CommitSummary[];
  files: ChangedFile[];
  truncated: boolean;
}

/** Show Diff with Working Tree: files that differ between a revision and the work tree. */
export interface WorktreeComparison {
  commitId: string;
  files: ChangedFile[];
}

// MCP server and command line tool (src-tauri/src/mcp)

export type McpToolCategory = "Workspace" | "Git" | "Files" | "Search" | "Scripts" | "Terminal" | "App" | "Performance";

/** Who made a call: an AI harness over MCP, or `nibtree cli`. */
export type McpClient = "mcp" | "cli";

export interface McpStatus {
  enabled: boolean;
  cliEnabled: boolean;
  running: boolean;
  port: number;
  /** http://127.0.0.1:<port>/mcp */
  url: string;
  /** Only returned so Settings can show and copy it. */
  token: string | null;
  error: string | null;
  /** The program that runs the tool plus " cli": the app binary, or `nibtree-cli.exe` on Windows. */
  cliCommand: string;
  /** Where `nibtree` is linked (`nibtree.cmd` on Windows), or null when it is not installed. */
  cliInstalledPath: string | null;
  /** Where Install puts the command: ~/.local/bin, or WindowsApps on Windows. */
  cliFolder: string;
  /** The install folder is on PATH. */
  cliOnPath: boolean;
}

export interface McpToolInfo {
  name: string;
  title: string;
  description: string;
  category: McpToolCategory;
  kind: "backend" | "ui";
  readOnly: boolean;
  destructive: boolean;
  /** The state until the user switches it: off for destructive tools and those outside the workspace. */
  defaultEnabled: boolean;
  /** Effective state: the user's choice, else the default. */
  enabled: boolean;
  inputSchema: Record<string, unknown>;
}

/** A tool the frontend implements; sent once with mcp_register_ui_tools. */
export interface McpUiToolDef {
  name: string;
  title: string;
  description: string;
  category: McpToolCategory;
  readOnly: boolean;
  destructive: boolean;
  inputSchema: Record<string, unknown>;
}

export interface McpUiResult {
  ok: boolean;
  text: string;
  structured: Record<string, unknown> | null;
  imagePngBase64: string | null;
}

/** Payload of the "mcp-ui-request" event: answer it with mcp_ui_respond. */
/** clone_repository asks the window to open the clone, in place of its folders or added to them. */
export interface McpOpenFolderRequest {
  folderPath: string;
  mode: "window" | "workspace";
}

export interface McpUiRequest {
  requestId: number;
  tool: string;
  arguments: Record<string, unknown>;
}

/** A credential prompt of git or ssh (src-tauri/src/askpass.rs), shown by AskpassDialog. */
export interface AskpassQuestion {
  id: number;
  /** The prompt as git or ssh wrote it, such as "Username for 'https://github.com': ". */
  prompt: string;
  /** The repository (or, for a clone, the folder) of the git command that asks. */
  repoPath: string;
}

export interface McpActivity {
  tool: string;
  /** Milliseconds since the epoch. */
  at: number;
  durationMs: number;
  ok: boolean;
  error: string | null;
  client: McpClient;
}

/** The debug memory log (src-tauri/src/memory_log.rs). */
export interface MemoryLogStatus {
  enabled: boolean;
  /** Absolute path of memory.log. */
  path: string;
  intervalMs: number;
  thresholdMb: number;
}

/** user.name and user.email at one config level (src-tauri/src/git/identity.rs). */
export interface IdentityValues {
  name: string | null;
  email: string | null;
}

export interface Identity {
  /** What `git config --global` holds. */
  global: IdentityValues;
  /** The repository's own config; empty without a repository. */
  local: IdentityValues;
  /** git would commit with a configured name and email (any level, includes or environment). */
  complete: boolean;
  /** The file `git config --global` writes. */
  globalFile: string | null;
}

export type IdentityScope = "global" | "local";

/** One of the current user's recent commit messages. */
export interface RecentMessage {
  message: string;
  /** Commit time in milliseconds since the epoch. */
  time: number;
}

/** Why a Local History version was kept (local_history/store.rs). */
export type SnapshotLabel =
  | "saved"
  | "beforeSave"
  | "externalChange"
  | "beforeExternalChange"
  | "beforeDiscard"
  | "beforeRollback"
  | "beforeRevert"
  | "other";

/** One version of a file in Local History. */
export interface LocalSnapshot {
  /** Milliseconds since the epoch. */
  time: number;
  label: SnapshotLabel;
  /** Git blob id of the text: the version's id. */
  hash: string;
  /** Bytes of the text. */
  size: number;
}

export interface FileLocalHistory {
  filePath: string;
  /** False for a deleted file. */
  exists: boolean;
  /** Newest first. */
  snapshots: LocalSnapshot[];
}

/** A file with Local History that is gone from disk (Recently Deleted). */
export interface DeletedLocalFile {
  filePath: string;
  latest: LocalSnapshot;
  count: number;
}

export interface LocalHistoryUsage {
  files: number;
  snapshots: number;
  /** Compressed bytes on disk. */
  bytes: number;
}

/** A version the editor asks Local History to keep: its text, or the file on disk when `text` is null. */
export interface LocalHistoryRecord {
  filePath: string;
  text: string | null;
  eol: Eol | null;
  label: SnapshotLabel;
}

/** Unsaved text kept across restarts (unsaved.rs): whose it is. */
export interface UnsavedMeta {
  /** An absolute file path, or the path of an Untitled tab. */
  tabPath: string;
  workspaceId: string;
  /** Milliseconds since the epoch. */
  savedAt: number;
}

export interface UnsavedText extends UnsavedMeta {
  text: string;
}

/** What moved a ref, read from the reflog message (git/reflog.rs). */
export type ReflogAction =
  | "commit"
  | "initialCommit"
  | "amend"
  | "merge"
  | "checkout"
  | "reset"
  | "rebase"
  | "pull"
  | "cherryPick"
  | "revert"
  | "branch"
  | "clone"
  | "other";

export interface ReflogEntry {
  /** 0 is the newest: `HEAD@{0}`. */
  index: number;
  selector: string;
  /** All zeros when the ref did not exist before. */
  oldId: string;
  newId: string;
  oldShortId: string;
  newShortId: string;
  action: ReflogAction;
  /** The message without its action prefix. */
  detail: string;
  message: string;
  /** Seconds since the epoch. */
  time: number;
  committerName: string;
  /** For a checkout: the branch or commit it moved away from. */
  checkoutFrom: string | null;
}

export interface ReflogPage {
  refName: string;
  entries: ReflogEntry[];
  total: number;
}

/** `last_action`: the latest HEAD movement and what Undo needs around it. */
export interface LastAction {
  entry: ReflogEntry | null;
  branch: string | null;
  /** The entry's new commit is on a remote branch already. */
  pushed: boolean;
  /** For a checkout: `checkoutFrom` names a local branch that still exists. */
  fromBranchExists: boolean;
}

/** `move_head_back`: "soft" keeps the changes staged; "keep" falls back to "mixed" when local changes are in the way. */
export type HeadBackMode = "soft" | "keep";

export interface BisectCommit {
  id: string;
  shortId: string;
  summary: string;
}

export interface BisectState {
  /** Branch or commit `git bisect reset` goes back to. */
  start: string;
  badTerm: string;
  goodTerm: string;
  bad: string | null;
  good: string[];
  skipped: string[];
  current: string | null;
  /** Commits that may still be the first bad one. */
  remaining: number;
  remainingCapped: boolean;
  steps: number;
  firstBad: BisectCommit | null;
}

export type BisectMark = "good" | "bad" | "skip";

export type AutoFetchOutcome = "fetched" | "upToDate" | "skipped" | "failed";

export interface AutoFetchResult {
  outcome: AutoFetchOutcome;
  skipReason: "noRemotes" | "operation" | "bisect" | "busy" | null;
  errorKind: "auth" | "offline" | "other" | null;
  /** Git's last error line when the fetch failed. */
  message: string;
}

/** `WindowOpened` in src-tauri/src/commands/window.rs. */
export interface WindowOpened {
  windowLabel: string;
  /** Another window already showed the folders and was focused instead. */
  existing: boolean;
}

/** `ConfigChanged` in src-tauri/src/commands/config.rs: what another window changed. */
export interface ConfigChangedEvent {
  configName: "settings" | "state";
  patch: unknown;
}
