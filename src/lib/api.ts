// Typed wrappers around the Tauri commands in src-tauri/src/commands.

import { type Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ConfigPatch } from "./stores/configPatch";
import type {
  AppError,
  AskpassQuestion,
  DeletedLocalFile,
  FileLocalHistory,
  FoundProgram,
  LocalHistoryRecord,
  PrepareReport,
  ProviderUsage,
  LocalHistoryUsage,
  AutoFetchResult,
  BisectMark,
  BisectState,
  HeadBackMode,
  LastAction,
  ReflogPage,
  GitCommandEntry,
  IgnoreOutcome,
  IgnoreTarget,
  ShelfEntry,
  ShelfFileDiff,
  CommitDetails,
  CommitSummary,
  BlameInfo,
  ConflictSummary,
  DiffArea,
  Eol,
  FileContent,
  FolderListing,
  BrowseListing,
  FileDiff,
  HeadFile,
  HeadVersion,
  LineMarks,
  PreviewSource,
  PreviewStat,
  FileHistoryEntry,
  FileSearchProgress,
  FileSearchResults,
  GitOutput,
  GitProgressEvent,
  LaunchMode,
  LineHistoryEntry,
  LogPage,
  MemoryUsage,
  MemoryLogStatus,
  MergeDocument,
  NodeInstall,
  OpOutcome,
  OsInfo,
  OutgoingCommits,
  PatchSource,
  RebaseEntry,
  RebasePlan,
  PullMode,
  Refs,
  RefsSnapshot,
  RemoteInfo,
  ReplaceOutcome,
  ReplaceRequest,
  OpenFilesChangedEvent,
  RepoChangedEvent,
  RepoInfo,
  RepoStatus,
  ResetMode,
  RevisionDiff,
  ScriptSource,
  ShellProfile,
  Side,
  StashEntry,
  OutlineResult,
  StatusSnapshot,
  SymbolScope,
  SymbolSearchProgress,
  SymbolSearchResults,
  TerminalInfo,
  TerminalMemory,
  TerminalOutputMessage,
  TextSearchBatch,
  TextSearchOptions,
  WorkspaceChangedEvent,
  WorkspaceFile,
  WorkspaceInfo,
} from "./types";
import { rawBody } from "./rawBody";
import type { TerminalStashData } from "./terminal/terminalStash";
import type {
  GhCliStatus,
  GitHubAccount,
  GitHubGist,
  GitHubGistRequest,
  GitHubRepositoryInfo,
  GitHubShareRequest,
  GitHubSharedRepository,
  GitHubSyncForkOutcome,
} from "./types";
import type { FileMove, LfsStatus, SubmoduleInfo, WorktreeBranch, WorktreeInfo, WorktreeSummary } from "./types";
import type { CompareSide, FileCompare } from "./types";
import type { LineAction, LineSelection, LinesOutcome } from "./types";
import type { BranchComparison, CommitOptions, MergeOptions, RebaseOptions, WorktreeComparison } from "./types";
import type { Identity, IdentityScope, RecentMessage } from "./types";
import type {
  McpActivity,
  McpOpenFolderRequest,
  McpStatus,
  McpToolInfo,
  McpUiRequest,
  McpUiResult,
  McpUiToolDef,
} from "./types";
import type { ConfigChangedEvent, WindowOpened } from "./types";
import type { UnsavedMeta, UnsavedText } from "./types";

export function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as AppError).message ?? "Unknown error");
  }
  return String(error ?? "Unknown error");
}

export const api = {
  // Repository
  getLaunchMode: () => invoke<LaunchMode>("get_launch_mode"),
  openRepo: (repoPath: string) => invoke<RepoInfo>("open_repo", { repoPath }),

  // Workspace (a folder holding any number of repositories)
  openWorkspace: (folderPath: string) => invoke<WorkspaceInfo>("open_workspace", { folderPath }),
  discoverRepositories: (workspaceRoot: string) => invoke<RepoInfo[]>("discover_repositories", { workspaceRoot }),
  initRepository: (folderPath: string) => invoke<RepoInfo>("init_repository", { folderPath }),
  watchWorkspace: (workspaceRoot: string, repoRoots: string[]) =>
    invoke<void>("watch_workspace", { workspaceRoot, repoRoots }),
  unwatchWorkspace: (workspaceRoot: string) => invoke<void>("unwatch_workspace", { workspaceRoot }),
  /** The files open in this window's tabs: the watcher reports their changes even when git ignores them. */
  watchOpenFiles: (filePaths: string[]) => invoke<void>("watch_open_files", { filePaths }),
  readWorkspaceFile: (filePath: string) => invoke<WorkspaceFile>("read_workspace_file", { filePath }),
  writeWorkspaceFile: (filePath: string, folders: string[]) =>
    invoke<void>("write_workspace_file", { filePath, folders }),

  // Status and commit
  /** The status, or `status: null` when it still has `knownHash` (the caller keeps the one it holds). */
  getStatus: (repoPath: string, knownHash: string | null = null) =>
    invoke<StatusSnapshot>("get_status", { repoPath, knownHash }),
  getFileDiff: (repoPath: string, filePath: string, origPath: string | null, area: DiffArea) =>
    invoke<FileDiff>("get_file_diff", { repoPath, filePath, origPath, area, knownVersion: null }),
  /** Null when the diff still has `knownVersion` (a FileDiff's `version`): nothing is read or sent. */
  getFileDiffIfChanged: (
    repoPath: string,
    filePath: string,
    origPath: string | null,
    area: DiffArea,
    knownVersion: string | null,
  ) => invoke<FileDiff | null>("get_file_diff", { repoPath, filePath, origPath, area, knownVersion }),
  stageFiles: (repoPath: string, filePaths: string[]) => invoke<void>("stage_files", { repoPath, filePaths }),
  unstageFiles: (repoPath: string, filePaths: string[]) => invoke<void>("unstage_files", { repoPath, filePaths }),
  discardFiles: (repoPath: string, trackedPaths: string[], untrackedPaths: string[]) =>
    invoke<void>("discard_files", { repoPath, trackedPaths, untrackedPaths }),
  stageContent: (repoPath: string, filePath: string, content: string, eol: Eol) =>
    invoke<void>("stage_content", { repoPath, filePath, content, eol }),
  /**
   * Stages, unstages or discards only the selected lines of a file's diff. `knownVersion` is the
   * diff's `version`: a file that changed since then is refused instead of patched at the wrong lines.
   */
  applySelectedLines: (
    repoPath: string,
    filePath: string,
    origPath: string | null,
    action: LineAction,
    selection: LineSelection,
    knownVersion: string | null,
  ) => invoke<LinesOutcome>("apply_selected_lines", { repoPath, filePath, origPath, action, selection, knownVersion }),
  /**
   * Revert (`reverse`) or apply the selected lines of the change from `oldRevision` (null: no file, a root commit)
   * to `newRevision` (null: the work tree) in the work tree file only. The outcome's patch undoes it.
   */
  applyRevisionLines: (
    repoPath: string,
    filePath: string,
    origPath: string | null,
    oldRevision: string | null,
    newRevision: string | null,
    selection: LineSelection,
    reverse: boolean,
  ) =>
    invoke<LinesOutcome>("apply_revision_lines", {
      repoPath,
      filePath,
      origPath,
      oldRevision,
      newRevision,
      selection,
      reverse,
    }),
  /**
   * Undo of Discard Selected Lines or a reverted change: applies the taken back patch to the work tree again;
   * `reverse` takes an applied change back out instead.
   */
  restoreDiscardedLines: (repoPath: string, patch: string, reverse = false) =>
    invoke<void>("restore_discarded_lines", { repoPath, patch, reverse }),
  /** Resolves to the file's new version (see FileContent.version). */
  writeWorktreeFile: (repoPath: string, filePath: string, content: string, eol: Eol) =>
    invoke<string>("write_worktree_file", { repoPath, filePath, content, eol }),
  /** `options` (sign-off, author, GPG, skip hooks) null commits with the defaults. */
  commit: (repoPath: string, message: string, amend: boolean, options: CommitOptions | null = null) =>
    invoke<GitOutput>("commit", { repoPath, message, amend, options }),
  /** Stages every tracked change, then commits (`git commit --all`); untracked files stay out. */
  commitAll: (repoPath: string, message: string, amend: boolean, options: CommitOptions | null = null) =>
    invoke<GitOutput>("commit_all", { repoPath, message, amend, options }),
  /** `git reset --soft HEAD~1`; returns the undone commit's message. */
  undoLastCommit: (repoPath: string) => invoke<string>("undo_last_commit", { repoPath }),
  getHeadMessage: (repoPath: string) => invoke<string>("get_head_message", { repoPath }),
  /** Commits only `filePaths` (`git commit --only`), staging them first; other staged changes stay staged. */
  commitFiles: (
    repoPath: string,
    filePaths: string[],
    message: string,
    amend: boolean,
    options: CommitOptions | null = null,
  ) => invoke<GitOutput>("commit_files", { repoPath, filePaths, message, amend, options }),
  /** Global and repository user.name and user.email; `complete` says git would commit with them. */
  getIdentity: (repoPath: string | null) => invoke<Identity>("get_identity", { repoPath }),
  /** `git config --global` or `--local`; an empty name or email unsets it. */
  setIdentity: (repoPath: string | null, scope: IdentityScope, name: string, email: string) =>
    invoke<Identity>("set_identity", { repoPath, scope, name, email }),
  /** The current user's recent commit messages from HEAD, newest first. */
  recentCommitMessages: (repoPath: string, limit: number) =>
    invoke<RecentMessage[]>("recent_commit_messages", { repoPath, limit }),
  /** The text of the `commit.template` file, or null. */
  getCommitTemplate: (repoPath: string) => invoke<string | null>("get_commit_template", { repoPath }),
  /** Rollback: staged and unstaged changes of tracked files go back to HEAD; added files are unstaged (and deleted when asked). */
  rollbackFiles: (repoPath: string, filePaths: string[], deleteAdded: boolean) =>
    invoke<void>("rollback_files", { repoPath, filePaths, deleteAdded }),

  // Conflicts
  listConflicts: (repoPath: string) => invoke<ConflictSummary>("list_conflicts", { repoPath }),
  loadConflict: (repoPath: string, conflictPath: string, ignoreWhitespace: boolean) =>
    invoke<MergeDocument>("load_conflict", { repoPath, conflictPath, ignoreWhitespace }),
  saveResolution: (repoPath: string, conflictPath: string, content: string, eol: Eol) =>
    invoke<void>("save_resolution", { repoPath, conflictPath, content, eol }),
  acceptSide: (repoPath: string, conflictPaths: string[], side: Side) =>
    invoke<void>("accept_side", { repoPath, conflictPaths, side }),
  continueOperation: (repoPath: string) => invoke<OpOutcome>("continue_operation", { repoPath }),
  abortOperation: (repoPath: string) => invoke<OpOutcome>("abort_operation", { repoPath }),
  skipRebaseCommit: (repoPath: string) => invoke<OpOutcome>("skip_rebase_commit", { repoPath }),
  loadMergetool: (ignoreWhitespace: boolean) => invoke<MergeDocument>("load_mergetool", { ignoreWhitespace }),
  saveMergetool: (content: string, eol: Eol) => invoke<void>("save_mergetool", { content, eol }),
  cancelMergetool: () => invoke<void>("cancel_mergetool"),

  // Branches
  getRefs: (repoPath: string) => invoke<Refs>("get_refs", { repoPath }),
  /** Refs for a refresh: `refs: null` while `knownFingerprint` (refs, stashes, remotes, worktrees) still matches. */
  getRefsSnapshot: (repoPath: string, knownFingerprint: string | null) =>
    invoke<RefsSnapshot>("get_refs_snapshot", { repoPath, knownFingerprint }),
  checkoutBranch: (repoPath: string, branchName: string) => invoke<void>("checkout_branch", { repoPath, branchName }),
  checkoutRemoteBranch: (repoPath: string, remoteBranch: string, localName: string) =>
    invoke<void>("checkout_remote_branch", { repoPath, remoteBranch, localName }),
  createBranch: (repoPath: string, branchName: string, startPoint: string | null, checkout: boolean) =>
    invoke<void>("create_branch", { repoPath, branchName, startPoint, checkout }),
  renameBranch: (repoPath: string, branchName: string, newName: string) =>
    invoke<void>("rename_branch", { repoPath, branchName, newName }),
  /** Deletes a local branch and returns the commit it pointed at, for Restore. */
  deleteBranch: (repoPath: string, branchName: string, force: boolean) =>
    invoke<string>("delete_branch", { repoPath, branchName, force }),
  /** One page of the reflog of HEAD (refName null) or of a local branch, newest first. */
  getReflog: (repoPath: string, refName: string | null, offset: number, limit: number) =>
    invoke<ReflogPage>("get_reflog", { repoPath, refName, offset, limit }),
  /** The latest HEAD movement, for Undo Last Action. */
  lastAction: (repoPath: string) => invoke<LastAction>("last_action", { repoPath }),
  /** Moves HEAD back to `commitId` while it still points at `headId`; returns the reset mode used. */
  moveHeadBack: (repoPath: string, headId: string, commitId: string, mode: HeadBackMode) =>
    invoke<string>("move_head_back", { repoPath, headId, commitId, mode }),
  bisectState: (repoPath: string) => invoke<BisectState | null>("bisect_state", { repoPath }),
  /** Starts a bisect; with a bad commit (and good ones) git checks out the first commit to test. */
  bisectStart: (repoPath: string, badCommit: string | null, goodCommits: string[]) =>
    invoke<string>("bisect_start", { repoPath, badCommit, goodCommits }),
  /** Marks `commitId` (the checked out commit when null) good, bad or skipped. */
  bisectMark: (repoPath: string, mark: BisectMark, commitId: string | null) =>
    invoke<string>("bisect_mark", { repoPath, mark, commitId }),
  bisectReset: (repoPath: string) => invoke<string>("bisect_reset", { repoPath }),
  mergeBranch: (repoPath: string, branchName: string) => invoke<OpOutcome>("merge_branch", { repoPath, branchName }),
  rebaseOnto: (repoPath: string, branchName: string) => invoke<OpOutcome>("rebase_onto", { repoPath, branchName }),
  /** The Merge dialog: merges `branchName` into the current branch. */
  mergeWithOptions: (repoPath: string, branchName: string, options: MergeOptions) =>
    invoke<OpOutcome>("merge_with_options", { repoPath, branchName, options }),
  /** The Rebase dialog (not interactive). */
  rebaseWithOptions: (repoPath: string, options: RebaseOptions) =>
    invoke<OpOutcome>("rebase_with_options", { repoPath, options }),
  /** Fetches and fast-forwards a branch that is not checked out from its upstream (`git fetch <remote> <upstream>:<branch>`). */
  updateBranch: (repoPath: string, branchName: string) => invoke<OpOutcome>("update_branch", { repoPath, branchName }),
  /** Pushes a local branch to its upstream, or publishes it to the default remote and tracks it. */
  pushBranch: (repoPath: string, branchName: string) => invoke<OpOutcome>("push_branch", { repoPath, branchName }),
  setBranchUpstream: (repoPath: string, branchName: string, upstream: string) =>
    invoke<void>("set_branch_upstream", { repoPath, branchName, upstream }),
  unsetBranchUpstream: (repoPath: string, branchName: string) =>
    invoke<void>("unset_branch_upstream", { repoPath, branchName }),
  /** Commits only `branchName` has, commits only `baseName` has, and the files that differ. */
  compareBranches: (repoPath: string, branchName: string, baseName: string) =>
    invoke<BranchComparison>("compare_branches", { repoPath, branchName, baseName }),
  /** Files that differ between `revision` and the work tree (untracked files count as added). */
  compareWithWorktree: (repoPath: string, revision: string) =>
    invoke<WorktreeComparison>("compare_with_worktree", { repoPath, revision }),
  /** One file between two revisions: `fromRevision` left, `toRevision` right. */
  revisionsFileDiff: (
    repoPath: string,
    fromRevision: string,
    toRevision: string,
    filePath: string,
    origPath: string | null,
  ) => invoke<FileDiff>("revisions_file_diff", { repoPath, fromRevision, toRevision, filePath, origPath }),

  // Remote
  /** Every remote, pruning deleted branches. */
  fetchAll: (repoPath: string) => invoke<OpOutcome>("fetch_all", { repoPath }),
  /** The auto fetch timer: a quiet `git fetch --all --prune` that never asks for credentials. */
  autoFetch: (repoPath: string) => invoke<AutoFetchResult>("auto_fetch", { repoPath }),
  /** The default remote, optionally pruning deleted branches. */
  fetch: (repoPath: string, prune: boolean) => invoke<OpOutcome>("fetch", { repoPath, prune }),
  pull: (repoPath: string, rebase = false) => invoke<OpOutcome>("pull", { repoPath, rebase }),
  push: (repoPath: string, force: boolean) => invoke<OpOutcome>("push", { repoPath, force }),
  pushTags: (repoPath: string) => invoke<OpOutcome>("push_tags", { repoPath }),
  /** The Pull dialog: `remoteName` and `branchName` null pull the upstream; `noCommit` only applies to a merge. */
  pullWithOptions: (
    repoPath: string,
    remoteName: string | null,
    branchName: string | null,
    mode: PullMode,
    noCommit: boolean,
  ) => invoke<OpOutcome>("pull_with_options", { repoPath, remoteName, branchName, mode, noCommit }),
  /** The Push dialog: pushes the current branch to `remoteName`/`remoteBranch`, setting the upstream when it has none. */
  pushWithOptions: (
    repoPath: string,
    remoteName: string,
    remoteBranch: string,
    forceWithLease: boolean,
    pushTags: boolean,
  ) => invoke<OpOutcome>("push_with_options", { repoPath, remoteName, remoteBranch, forceWithLease, pushTags }),
  /** Commits of HEAD that are not on `remoteName`/`remoteBranch`, or on no remote when that branch does not exist. */
  outgoingCommits: (repoPath: string, remoteName: string, remoteBranch: string) =>
    invoke<OutgoingCommits>("outgoing_commits", { repoPath, remoteName, remoteBranch }),
  listRemotes: (repoPath: string) => invoke<RemoteInfo[]>("list_remotes", { repoPath }),
  addRemote: (repoPath: string, remoteName: string, fetchUrl: string, pushUrl: string | null) =>
    invoke<void>("add_remote", { repoPath, remoteName, fetchUrl, pushUrl }),
  /** Renames when `newName` differs, then sets the URLs; a null `pushUrl` pushes to the fetch URL. */
  editRemote: (repoPath: string, remoteName: string, newName: string, fetchUrl: string, pushUrl: string | null) =>
    invoke<void>("edit_remote", { repoPath, remoteName, newName, fetchUrl, pushUrl }),
  removeRemote: (repoPath: string, remoteName: string) => invoke<void>("remove_remote", { repoPath, remoteName }),
  /** `git clone --progress` into `parentDir`/`folderName` (missing or empty); progress lines arrive on `progress`. Resolves with the clone's path. */
  cloneRepository: (
    url: string,
    parentDir: string,
    folderName: string,
    progress: Channel<string>,
    cancelId: string | null = null,
  ) => invoke<string>("clone_repository", { url, parentDir, folderName, progress, cancelId }),
  /** Stops the command started with `cancelId`; with a clone it fails with "Clone cancelled". False when none runs. */
  cancelGitCommand: (cancelId: string) => invoke<boolean>("cancel_git_command", { cancelId }),

  // Patches
  /** Writes `git diff --binary` of `source` (limited to `filePaths` when not empty) to `patchPath`; resolves with the file count. */
  createPatch: (repoPath: string, source: PatchSource, filePaths: string[], patchPath: string) =>
    invoke<number>("create_patch", { repoPath, source, filePaths, patchPath }),
  /** `git format-patch -1 --stdout` of a commit, written to `patchPath`. */
  createCommitPatch: (repoPath: string, commitId: string, patchPath: string) =>
    invoke<void>("create_commit_patch", { repoPath, commitId, patchPath }),
  /** Checks the patch (`git apply --check`), applies it to the work tree, else tries `git apply --3way`. */
  applyPatch: (repoPath: string, patchPath: string | null, patchText: string | null) =>
    invoke<OpOutcome>("apply_patch", { repoPath, patchPath, patchText }),
  readClipboardText: () => invoke<string>("read_clipboard_text"),

  // Tags (the list comes with getRefs)
  /** Annotated when `message` has text, lightweight otherwise; at HEAD unless `commitId` is given. */
  createTag: (repoPath: string, tagName: string, message: string | null, commitId: string | null = null) =>
    invoke<void>("create_tag", { repoPath, tagName, message, commitId }),
  deleteTag: (repoPath: string, tagName: string) => invoke<void>("delete_tag", { repoPath, tagName }),

  // History
  getLog: (repoPath: string, offset: number, limit: number, allRefs: boolean) =>
    invoke<LogPage>("get_log", { repoPath, offset, limit, allRefs, knownTips: null }).then(
      (page) => page.commits ?? [],
    ),
  /** A page of history, or `commits: null` without walking while the branch tips still match `knownTips`. */
  getLogPage: (repoPath: string, offset: number, limit: number, allRefs: boolean, knownTips: string | null) =>
    invoke<LogPage>("get_log", { repoPath, offset, limit, allRefs, knownTips }),
  getCommitDetails: (repoPath: string, commitId: string) =>
    invoke<CommitDetails>("get_commit_details", { repoPath, commitId }),
  /** A file of a commit against one of its parents: 0 is the first. */
  getCommitFileDiff: (
    repoPath: string,
    commitId: string,
    filePath: string,
    origPath: string | null,
    parentIndex: number,
  ) => invoke<FileDiff>("get_commit_file_diff", { repoPath, commitId, filePath, origPath, parentIndex }),
  /** Blames the file at `revision`, or as it is on disk when null. */
  blameFile: (repoPath: string, filePath: string, revision: string | null) =>
    invoke<BlameInfo>("blame_file", { repoPath, filePath, revision }),
  /** Blames an editor's LF-normalized `text`, unsaved edits included; `eol` is the file's own. */
  blameContents: (repoPath: string, filePath: string, text: string, eol: Eol) =>
    invoke<BlameInfo>("blame_contents", rawBody({ repoPath, filePath, eol }, text)),
  /** The editor's changed lines against the index, else HEAD (at `origPath` for a staged rename). */
  lineChangeMarks: (repoPath: string, filePath: string, origPath: string | null, text: string) =>
    invoke<LineMarks>("line_change_marks", rawBody({ repoPath, filePath, origPath }, text)),
  baseFileVersion: (repoPath: string, filePath: string, origPath: string | null) =>
    invoke<HeadVersion>("base_file_version", { repoPath, filePath, origPath }),
  /** The file the editor's change bars compare with: as staged, else as of HEAD. */
  readBaseFile: (repoPath: string, filePath: string, origPath: string | null) =>
    invoke<HeadFile>("read_base_file", { repoPath, filePath, origPath }),
  readHeadFile: (repoPath: string, filePath: string, origPath: string | null) =>
    invoke<HeadFile>("read_head_file", { repoPath, filePath, origPath }),
  cherryPick: (repoPath: string, commitId: string) => invoke<OpOutcome>("cherry_pick", { repoPath, commitId }),
  revertCommit: (repoPath: string, commitId: string) => invoke<OpOutcome>("revert_commit", { repoPath, commitId }),
  resetTo: (repoPath: string, commitId: string, mode: ResetMode) =>
    invoke<void>("reset_to", { repoPath, commitId, mode }),
  checkoutCommit: (repoPath: string, commitId: string) => invoke<void>("checkout_commit", { repoPath, commitId }),
  /** The commits an interactive rebase from `fromCommit` (included) to HEAD rewrites. */
  rebasePlan: (repoPath: string, fromCommit: string) => invoke<RebasePlan>("rebase_plan", { repoPath, fromCommit }),
  /** The commits of `upstream`..HEAD for an interactive rebase onto `upstream`. */
  rebasePlanOnto: (repoPath: string, upstream: string) =>
    invoke<RebasePlan>("rebase_plan_onto", { repoPath, upstream }),
  /** `git rebase -i` with the given todo, oldest first; `base` null rebases from the root. */
  interactiveRebase: (repoPath: string, base: string | null, entries: RebaseEntry[], autostash: boolean) =>
    invoke<OpOutcome>("interactive_rebase", { repoPath, base, entries, autostash }),
  /** The full commit id a revision (HEAD, a branch, a tag, a hash) points at. */
  resolveRevision: (repoPath: string, revision: string) => invoke<string>("resolve_revision", { repoPath, revision }),
  /** `git log --follow` of one file, newest first, with its path in each commit. */
  fileHistory: (repoPath: string, filePath: string, offset: number, limit: number) =>
    invoke<FileHistoryEntry[]>("file_history", { repoPath, filePath, offset, limit }),
  /** `git log -L startLine,endLine:filePath` (1-based, inclusive, lines of the HEAD version). */
  lineHistory: (repoPath: string, filePath: string, startLine: number, endLine: number, limit: number) =>
    invoke<LineHistoryEntry[]>("line_history", { repoPath, filePath, startLine, endLine, limit }),
  /** The file at `revision` against the work tree copy. */
  /** `origPath` is the old name of a renamed file, read from `revision`. */
  compareWithRevision: (repoPath: string, filePath: string, revision: string, origPath: string | null = null) =>
    invoke<RevisionDiff>("compare_with_revision", { repoPath, filePath, revision, origPath }),

  // Stash
  getStashes: (repoPath: string) => invoke<StashEntry[]>("get_stashes", { repoPath }),
  stashPush: (repoPath: string, message: string, includeUntracked: boolean) =>
    invoke<void>("stash_push", { repoPath, message, includeUntracked }),
  stashApply: (repoPath: string, stashIndex: number, pop: boolean) =>
    invoke<OpOutcome>("stash_apply", { repoPath, stashIndex, pop }),
  stashDrop: (repoPath: string, stashIndex: number) => invoke<void>("stash_drop", { repoPath, stashIndex }),
  stashClear: (repoPath: string) => invoke<void>("stash_clear", { repoPath }),

  // Worktrees
  listWorktrees: (repoPath: string) => invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),
  /** Every worktree with its changes, ahead and behind, operation and last activity (the top bar's switcher). */
  worktreeSummaries: (repoPath: string) => invoke<WorktreeSummary[]>("worktree_summaries", { repoPath }),
  /** `git worktree add`; resolves with the new work tree's path. */
  addWorktree: (repoPath: string, worktreePath: string, branch: WorktreeBranch) =>
    invoke<string>("add_worktree", { repoPath, worktreePath, branch }),
  removeWorktree: (repoPath: string, worktreePath: string, force: boolean) =>
    invoke<void>("remove_worktree", { repoPath, worktreePath, force }),
  lockWorktree: (repoPath: string, worktreePath: string, reason: string | null) =>
    invoke<void>("lock_worktree", { repoPath, worktreePath, reason }),
  unlockWorktree: (repoPath: string, worktreePath: string) =>
    invoke<void>("unlock_worktree", { repoPath, worktreePath }),
  /** `git worktree prune --verbose`; resolves with git's report. */
  pruneWorktrees: (repoPath: string) => invoke<string>("prune_worktrees", { repoPath }),
  worktreeHasChanges: (worktreePath: string) => invoke<boolean>("worktree_has_changes", { worktreePath }),

  // Submodules (paths are relative to the parent repository)
  listSubmodules: (repoPath: string) => invoke<SubmoduleInfo[]>("list_submodules", { repoPath }),
  /** `git submodule init`; every submodule when `submodulePaths` is empty. */
  initSubmodules: (repoPath: string, submodulePaths: string[]) =>
    invoke<string>("init_submodules", { repoPath, submodulePaths }),
  /** `git submodule update --init --recursive [--remote]`; progress arrives as git-progress events. */
  updateSubmodules: (repoPath: string, remote: boolean, submodulePaths: string[]) =>
    invoke<string>("update_submodules", { repoPath, remote, submodulePaths }),
  syncSubmodules: (repoPath: string) => invoke<string>("sync_submodules", { repoPath }),
  addSubmodule: (repoPath: string, url: string, submodulePath: string, branchName: string | null) =>
    invoke<string>("add_submodule", { repoPath, url, submodulePath, branchName }),
  /** Deinit, `git rm` and its cloned repository under .git/modules. */
  removeSubmodule: (repoPath: string, submodulePath: string) =>
    invoke<void>("remove_submodule", { repoPath, submodulePath }),

  // Git LFS
  /** `checkInstall` runs `git lfs version` again unless git-lfs is already known to be installed. */
  /** With the `knownStamp` of the last answer, an unchanged repository answers `unchanged` (no git-lfs process). */
  lfsStatus: (repoPath: string, checkInstall: boolean, knownStamp: string | null = null) =>
    invoke<LfsStatus>("lfs_status", { repoPath, checkInstall, knownStamp }),
  lfsTrack: (repoPath: string, pattern: string) => invoke<string>("lfs_track", { repoPath, pattern }),
  lfsUntrack: (repoPath: string, pattern: string) => invoke<string>("lfs_untrack", { repoPath, pattern }),
  /** `git lfs pull` (`pull` true) or `git lfs fetch`; progress arrives as git-progress events. */
  lfsTransfer: (repoPath: string, pull: boolean) => invoke<string>("lfs_transfer", { repoPath, pull }),
  lfsPrune: (repoPath: string) => invoke<string>("lfs_prune", { repoPath }),
  lfsInstall: (repoPath: string) => invoke<string>("lfs_install", { repoPath }),

  // User config in ~/.nibtree
  loadConfig: (configName: "settings" | "state") => invoke<unknown>("load_config", { configName }),
  /** Replaces a whole file: only to reset one that could not be read. Saves go through `updateConfig`. */
  saveConfig: (configName: "settings" | "state", value: unknown) => invoke<void>("save_config", { configName, value }),
  /** Writes only what this window changed into the file as it is now; the other windows hear of it. */
  updateConfig: (configName: "settings" | "state", patch: ConfigPatch) =>
    invoke<void>("update_config", { configName, patch }),
  configDir: () => invoke<string>("config_dir"),
  memoryUsage: () => invoke<MemoryUsage>("memory_usage"),
  /** Restarts this window's page in a new web content process (Clear Cache). */
  clearCache: (stash: TerminalStashData | null) => invoke<void>("clear_cache", { stash }),
  osInfo: () => invoke<OsInfo>("os_info"),

  // File explorer
  /**
   * Lists folders of one workspace folder (`dirPaths` relative to it, "" for itself) in one call. A folder whose
   * stamp in `known` still matches answers `unchanged` without its entries.
   */
  listDirectories: (
    rootPath: string,
    dirPaths: string[],
    repoRoots: string[],
    known: Record<string, string> | null = null,
  ) => invoke<FolderListing[]>("list_directories", { rootPath, dirPaths, repoRoots, known }),
  /** One folder's entries anywhere on the app's machine (null: the home folder), for the browser app's picker. */
  browseFolder: (folderPath: string | null) => invoke<BrowseListing>("browse_folder", { folderPath }),
  /** With the `knownVersion` of the text already shown, an unchanged file answers `unchanged` without its text. */
  readWorktreeFile: (repoPath: string, filePath: string, knownVersion: string | null = null) =>
    invoke<FileContent>("read_worktree_file", { repoPath, filePath, knownVersion }),
  /** Whether a previewed image or PDF is there, its size, and the limit when it is too big. */
  previewStat: (source: PreviewSource) =>
    invoke<PreviewStat>(
      "preview_stat",
      source.kind === "worktree"
        ? { filePath: source.filePath, repoRoot: null, revision: null }
        : { filePath: source.filePath, repoRoot: source.repoRoot, revision: source.revision },
    ),

  /** Two files (or a file and text) as a diff; null when both still have `knownVersion`. */
  compareFiles: (left: CompareSide, right: CompareSide, knownVersion: string | null = null) =>
    invoke<FileCompare | null>("compare_files", { left, right, knownVersion }),

  // File operations in the Files panel: absolute paths, each inside one of `workspaceRoots`.
  /** `name` may contain "/" to create nested folders; returns the new absolute path. */
  fileCreate: (workspaceRoots: string[], parentDir: string, name: string, isDir: boolean) =>
    invoke<string>("file_create", { workspaceRoots, parentDir, name, isDir }),
  /** Renames in place; `newName` is a single name. Returns the new absolute path. */
  fileRename: (workspaceRoots: string[], entryPath: string, newName: string) =>
    invoke<string>("file_rename", { workspaceRoots, entryPath, newName }),
  /** Copies into `targetDir`, using "name copy" names on conflicts. Returns the new paths in source order. */
  fileCopy: (workspaceRoots: string[], sourcePaths: string[], targetDir: string) =>
    invoke<string[]>("file_copy", { workspaceRoots, sourcePaths, targetDir }),
  /** Moves into `targetDir`; entries already there are skipped. Returns each moved entry. */
  fileMove: (workspaceRoots: string[], sourcePaths: string[], targetDir: string) =>
    invoke<FileMove[]>("file_move", { workspaceRoots, sourcePaths, targetDir, dryRun: false }),
  /**
   * A dry run of `fileMove`: the first name `targetDir` already has, or null when the move can go ahead. Other
   * refusals (into itself, outside the workspace) reject with the error the move would give.
   */
  fileMoveClash: (workspaceRoots: string[], sourcePaths: string[], targetDir: string) =>
    invoke<string | null>("file_move", { workspaceRoots, sourcePaths, targetDir, dryRun: true }),
  fileTrash: (workspaceRoots: string[], entryPaths: string[]) =>
    invoke<void>("file_trash", { workspaceRoots, entryPaths }),
  /** Which absolute paths are files inside the workspace folders (the terminal's clickable paths); never fails. */
  filesExist: (workspaceRoots: string[], filePaths: string[]) =>
    invoke<boolean[]>("files_exist", { workspaceRoots, filePaths }),
  /** Each path's real file path (the name as stored on disk) when it is a file inside the workspace, else null. */
  realFiles: (workspaceRoots: string[], filePaths: string[]) =>
    invoke<(string | null)[]>("real_files", { workspaceRoots, filePaths }),

  // Go to File. Indexing progress arrives on `progress` until the popup closes.
  fileSearchOpen: (workspaceRoots: string[], progress: Channel<FileSearchProgress>) =>
    invoke<FileSearchProgress>("file_search_open", { workspaceRoots, progress }),
  fileSearchQuery: (workspaceRoots: string[], query: string, limit: number) =>
    invoke<FileSearchResults>("file_search_query", { workspaceRoots, query, limit }),
  fileSearchClose: () => invoke<void>("file_search_close"),
  // Classes and Symbols: the symbol index is built on first use; progress arrives until the popup closes.
  symbolSearchOpen: (workspaceRoots: string[], progress: Channel<SymbolSearchProgress>) =>
    invoke<SymbolSearchProgress>("symbol_search_open", { workspaceRoots, progress }),
  symbolSearchQuery: (workspaceRoots: string[], query: string, scope: SymbolScope, limit: number) =>
    invoke<SymbolSearchResults>("symbol_search_query", { workspaceRoots, query, scope, limit }),
  // Find in Files: batches stream on `results`; a newer `searchId` stops the previous search.
  textSearch: (
    workspaceRoots: string[],
    searchId: number,
    query: string,
    options: TextSearchOptions,
    results: Channel<TextSearchBatch>,
  ) => invoke<void>("text_search", { workspaceRoots, searchId, query, options, results }),
  textSearchCancel: (searchId: number) => invoke<void>("text_search_cancel", { searchId }),
  // Replace in Files (or a preview count); a newer `replaceId` or a cancel stops it between files.
  replaceInFiles: (workspaceRoots: string[], replaceId: number, request: ReplaceRequest) =>
    invoke<ReplaceOutcome>("replace_in_files", { workspaceRoots, replaceId, request }),
  replaceInFilesCancel: (replaceId: number) => invoke<void>("replace_in_files_cancel", { replaceId }),
  // Quick Open "@": the symbols of the editor's text, unsaved edits included; nothing is cached.
  documentSymbols: (filePath: string, text: string) => invoke<OutlineResult>("document_symbols", { filePath, text }),

  // Integrated terminal. Output arrives as raw bytes on `output`, then the exit as its last message;
  // the view acks written output (terminal/outputFlow.ts).
  terminalShells: () => invoke<ShellProfile[]>("terminal_shells"),
  terminalSpawn: (
    options: { shellId: string | null; cwd: string | null; cols: number; rows: number },
    output: Channel<TerminalOutputMessage>,
  ) => invoke<TerminalInfo>("terminal_spawn", { ...options, output }),
  terminalWrite: (terminalId: number, data: string) => invoke<void>("terminal_write", { terminalId, data }),
  terminalAck: (terminalId: number, byteCount: number) => invoke<void>("terminal_ack", { terminalId, byteCount }),
  terminalResize: (terminalId: number, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { terminalId, cols, rows }),
  terminalClose: (terminalId: number) => invoke<void>("terminal_close", { terminalId }),
  /** Closes every terminal, e.g. left over after a reload of the window. */
  terminalCloseAll: () => invoke<void>("terminal_close_all"),
  /** This window's terminals and runs, each with what its shell started. */
  terminalMemory: () => invoke<TerminalMemory[]>("terminal_memory"),
  /** What Clear Cache left for this page, once; null after a normal start. */
  terminalUnstash: () => invoke<TerminalStashData | null>("terminal_unstash"),
  /** Connects a terminal left running by Clear Cache to this page; false when it is gone. */
  terminalReattach: (terminalId: number, output: Channel<TerminalOutputMessage>) =>
    invoke<boolean>("terminal_reattach", { terminalId, output }),

  // Git Console: the git commands the app ran. The first call starts the "git-command" events.
  gitConsoleEntries: () => invoke<GitCommandEntry[]>("git_console_entries"),
  gitConsoleClear: () => invoke<void>("git_console_clear"),
  gitConsoleSetEnabled: (enabled: boolean) => invoke<void>("git_console_set_enabled", { enabled }),

  // Scripts tool window: package.json, composer.json, Makefile, deno.json and justfile scripts.
  listProjectScripts: (folderPaths: string[]) => invoke<ScriptSource[]>("list_project_scripts", { folderPaths }),
  listNodeVersions: () => invoke<NodeInstall[]>("list_node_versions"),
  // Debug memory log: memory readings and UI events in ~/.nibtree/logs/memory.log.
  memoryLogConfigure: (enabled: boolean, intervalMs: number, thresholdMb: number) =>
    invoke<MemoryLogStatus>("memory_log_configure", { enabled, intervalMs, thresholdMb }),
  memoryLogEvent: (label: string) => invoke<void>("memory_log_event", { label }),

  // Local History (~/.nibtree/local-history): versions of files kept on save, outside changes and discards.
  localHistoryConfigure: (enabled: boolean, maxDays: number, maxSizeMb: number) =>
    invoke<void>("local_history_configure", { enabled, maxDays, maxSizeMb }),
  /** Keeps these versions, in order, in one call. */
  localHistoryRecord: (records: LocalHistoryRecord[]) => invoke<void>("local_history_record", { records }),
  localHistoryList: (filePath: string) => invoke<FileLocalHistory>("local_history_list", { filePath }),
  /** A version (left) against `currentText`, or the file on disk when it is null (right). */
  localHistoryDiff: (filePath: string, snapshotHash: string, currentText: string | null) =>
    invoke<FileDiff>("local_history_diff", { filePath, snapshotHash, currentText }),
  /** Writes a version back to a deleted file's path; refused when a file is there. */
  localHistoryRestore: (filePath: string, snapshotHash: string) =>
    invoke<void>("local_history_restore", { filePath, snapshotHash }),
  localHistoryDeleted: (folderPaths: string[]) => invoke<DeletedLocalFile[]>("local_history_deleted", { folderPaths }),
  localHistoryUsage: () => invoke<LocalHistoryUsage>("local_history_usage"),
  localHistoryClear: () => invoke<void>("local_history_clear"),
  // Remember unsaved changes: the text of Untitled tabs and of files with unsaved edits, in ~/.nibtree/unsaved.
  unsavedWrite: (tabPath: string, workspaceId: string, text: string) =>
    invoke<void>("unsaved_write", rawBody({ tabPath, workspaceId }, text)),
  unsavedRead: (tabPath: string) => invoke<UnsavedText | null>("unsaved_read", { tabPath }),
  unsavedRemove: (tabPaths: string[]) => invoke<void>("unsaved_remove", { tabPaths }),
  unsavedList: () => invoke<UnsavedMeta[]>("unsaved_list"),
  /** What a new task branches from: origin/HEAD's branch, else the current branch, else HEAD. */
  worktreeDefaultBase: (repoPath: string) => invoke<string>("worktree_default_base", { repoPath }),
  /** Copies the .worktreeinclude paths and links `linkDirs` from the main checkout into a new worktree. */
  prepareWorktree: (mainRoot: string, worktreePath: string, linkDirs: string[]) =>
    invoke<PrepareReport>("prepare_worktree", { mainRoot, worktreePath, linkDirs }),
  /** Keep computer awake: this window wants the display and system awake or not; true while it is held awake. */
  setKeepAwake: (active: boolean) => invoke<boolean>("set_keep_awake", { active }),
  /** Claude Code's and Codex's rate-limit usage; `fresh` (Refresh) may ask the Keychain again. */
  aiUsage: (fresh: boolean, hidden: string[]) => invoke<ProviderUsage[]>("ai_usage", { fresh, hidden }),
  /** Which agent programs the login shell's PATH has; `fresh` reads the shell's environment again. */
  findAgentPrograms: (programs: string[], fresh: boolean) =>
    invoke<FoundProgram[]>("find_agent_programs", { programs, fresh }),
  /** A script as its own process (the Run tab); output and exit arrive like a terminal's. */
  runScript: (
    options: { program: string; args: string[]; cwd: string; nodeBinDir: string | null; cols: number; rows: number },
    output: Channel<TerminalOutputMessage>,
  ) => invoke<TerminalInfo>("run_script", { ...options, output }),

  // Shelf (.git/nibtree-shelf). `filePaths` null unshelves every file.
  shelveChanges: (repoPath: string, name: string, filePaths: string[], keepInWorkingTree: boolean) =>
    invoke<ShelfEntry>("shelve_changes", { repoPath, name, filePaths, keepInWorkingTree }),
  listShelf: (repoPath: string) => invoke<ShelfEntry[]>("list_shelf", { repoPath }),
  unshelve: (repoPath: string, shelfId: string, filePaths: string[] | null, removeFromShelf: boolean) =>
    invoke<OpOutcome>("unshelve", { repoPath, shelfId, filePaths, removeFromShelf }),
  shelfFileDiff: (repoPath: string, shelfId: string, filePath: string) =>
    invoke<ShelfFileDiff>("shelf_file_diff", { repoPath, shelfId, filePath }),
  renameShelf: (repoPath: string, shelfId: string, name: string) =>
    invoke<ShelfEntry>("rename_shelf", { repoPath, shelfId, name }),
  deleteShelf: (repoPath: string, shelfId: string) => invoke<void>("delete_shelf", { repoPath, shelfId }),

  // Add to .gitignore / .git/info/exclude; `filePaths` are the files the patterns were made for.
  addToIgnore: (repoPath: string, patterns: string[], target: IgnoreTarget, filePaths: string[]) =>
    invoke<IgnoreOutcome>("add_to_ignore", { repoPath, patterns, target, filePaths }),
  ensureIgnoreFile: (repoPath: string, target: IgnoreTarget) =>
    invoke<string>("ensure_ignore_file", { repoPath, target }),
  untrackFiles: (repoPath: string, filePaths: string[]) => invoke<void>("untrack_files", { repoPath, filePaths }),

  // GitHub account (src-tauri/src/github). The token goes in once and never comes back.
  /** The signed-in account from ~/.nibtree/github.json; no network, no keychain. */
  githubAccount: () => invoke<GitHubAccount | null>("github_account"),
  githubCliStatus: () => invoke<GhCliStatus>("github_cli_status"),
  /** Verifies the token with GitHub, then keeps it only in the system keychain. */
  githubSignInWithToken: (token: string) => invoke<GitHubAccount>("github_sign_in_with_token", { token }),
  /** Uses `gh auth token` on demand; nothing is stored but the login. */
  githubSignInWithCli: () => invoke<GitHubAccount>("github_sign_in_with_cli"),
  githubSignOut: () => invoke<void>("github_sign_out"),
  /** Creates the repository on GitHub and adds it as a remote (committing first when asked); push next. */
  githubShareProject: (repoPath: string, request: GitHubShareRequest) =>
    invoke<GitHubSharedRepository>("github_share_project", { repoPath, request }),
  githubRepository: (owner: string, repo: string) => invoke<GitHubRepositoryInfo>("github_repository", { owner, repo }),
  githubSyncFork: (owner: string, repo: string, branchName: string) =>
    invoke<GitHubSyncForkOutcome>("github_sync_fork", { owner, repo, branchName }),
  githubCreateGist: (request: GitHubGistRequest) => invoke<GitHubGist>("github_create_gist", { request }),

  // MCP server and command line tool (src-tauri/src/mcp). Both off: nothing listens.
  /** Starts, restarts or stops the local server; `toolStates` holds only the tools switched from their default. */
  mcpConfigure: (enabled: boolean, cliEnabled: boolean, port: number, toolStates: Record<string, boolean>) =>
    invoke<McpStatus>("mcp_configure", { enabled, cliEnabled, port, toolStates }),
  mcpStatus: () => invoke<McpStatus>("mcp_status"),
  /** Backend and registered UI tools, with their effective enabled state. */
  mcpTools: () => invoke<McpToolInfo[]>("mcp_tools"),
  mcpRegisterUiTools: (tools: McpUiToolDef[]) => invoke<void>("mcp_register_ui_tools", { tools }),
  mcpUiRespond: (requestId: number, result: McpUiResult) => invoke<void>("mcp_ui_respond", { requestId, result }),
  /** A new secret token; connected tools need the new one. */
  mcpRegenerateToken: () => invoke<McpStatus>("mcp_regenerate_token"),
  /** The last 50 calls, newest last. */
  mcpActivity: () => invoke<McpActivity[]>("mcp_activity"),
  /** Links `nibtree` in ~/.local/bin, or writes `nibtree.cmd` into WindowsApps on Windows. */
  cliInstall: () => invoke<McpStatus>("cli_install"),
  cliUninstall: () => invoke<McpStatus>("cli_uninstall"),

  // Windows (src-tauri/src/commands/window.rs)
  /** What this window opens when its page starts or reloads (see windows/windowSession.ts). */
  windowStartup: () => invoke<unknown>("window_startup"),
  /**
   * This window shows these folders now: its title, the folders its previews and the MCP
   * tools reach, and the window session saved for the next start.
   */
  windowSetWorkspace: (folderPaths: string[], workspaceFile: string | null, title: string) =>
    invoke<void>("window_set_workspace", { folderPaths, workspaceFile, title }),
  /** Focuses the other window that already shows these folders and returns its label; null: open here. */
  windowFocusOwner: (folderPaths: string[], workspaceFile: string | null) =>
    invoke<string | null>("window_focus_owner", { folderPaths, workspaceFile }),
  /** A new window showing these folders (none: the welcome screen), or the window that already shows them. */
  windowOpen: (folderPaths: string[], workspaceFile: string | null) =>
    invoke<WindowOpened>("window_open", { folderPaths, workspaceFile }),
  /** Closes this window without asking (the page asks about unsaved edits first). */
  windowClose: () => invoke<void>("window_close"),
};

/** This window's label ("main", "window-2", ...). */
export function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

/**
 * Listens to events sent to this window, or to every window. A plain `listen` would also hear
 * events the backend sends to another window (a watcher of another workspace, say).
 */
function listenHere<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (received) => handler(received.payload), {
    target: { kind: "WebviewWindow", label: currentWindowLabel() },
  });
}

/** Another window changed settings.json or state.json. */
export function onConfigChanged(handler: (event: ConfigChangedEvent) => void): Promise<UnlistenFn> {
  return listenHere<ConfigChangedEvent>("config-changed", handler);
}

export function onRepoChanged(handler: (event: RepoChangedEvent) => void): Promise<UnlistenFn> {
  return listenHere<RepoChangedEvent>("repo-changed", handler);
}

export function onWorkspaceChanged(handler: (event: WorkspaceChangedEvent) => void): Promise<UnlistenFn> {
  return listenHere<WorkspaceChangedEvent>("workspace-changed", handler);
}

export function onOpenFilesChanged(handler: (event: OpenFilesChangedEvent) => void): Promise<UnlistenFn> {
  return listenHere<OpenFilesChangedEvent>("open-files-changed", handler);
}

export function onGitProgress(handler: (event: GitProgressEvent) => void): Promise<UnlistenFn> {
  return listenHere<GitProgressEvent>("git-progress", handler);
}

/** A git command started or finished (Git Console). Sent once `gitConsoleEntries` was called. */
export function onGitCommand(handler: (entry: GitCommandEntry) => void): Promise<UnlistenFn> {
  return listen<GitCommandEntry>("git-command", (event) => handler(event.payload));
}

/** A tool call for a UI tool; every request must be answered with `api.mcpUiRespond`. */
export function onMcpUiRequest(handler: (request: McpUiRequest) => void): Promise<UnlistenFn> {
  return listenHere<McpUiRequest>("mcp-ui-request", handler);
}

/** clone_repository finished and asks this window to open the clone. */
export function onMcpOpenFolder(handler: (request: McpOpenFolderRequest) => void): Promise<UnlistenFn> {
  return listenHere<McpOpenFolderRequest>("mcp-open-folder", handler);
}

/** Git or ssh asks for a username, password or passphrase; answer with `askpassRespond`. */
export function onAskpassRequest(handler: (question: AskpassQuestion) => void): Promise<UnlistenFn> {
  return listenHere<AskpassQuestion>("askpass-request", handler);
}

/** A credential question was answered (maybe in another window) or timed out. */
export function onAskpassDone(handler: (id: number) => void): Promise<UnlistenFn> {
  return listen<number>("askpass-done", (event) => handler(event.payload));
}

/** Answers a credential question; null cancels it, and git then fails as before. */
export function askpassRespond(id: number, answer: string | null): Promise<void> {
  return invoke<void>("askpass_respond", { id, answer });
}

/** A tool call finished (MCP or CLI), for the live Recent calls list. */
export function onMcpActivity(handler: (activity: McpActivity) => void): Promise<UnlistenFn> {
  return listen<McpActivity>("mcp-activity", (event) => handler(event.payload));
}
