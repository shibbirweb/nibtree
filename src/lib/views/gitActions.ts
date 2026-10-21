// Fetch, Pull, Push, Stash, Sync, Tags, Commit focus and Show Log, shared by the
// Git menu and the Changes view. Every action takes the repository root it runs
// in; without one it runs in the active repository (the Git menu's target).

import { tick } from "svelte";
import { api, errorMessage } from "$lib/api";
import { repoStore } from "$lib/stores/repo.svelte";
import { settings } from "$lib/stores/settings.svelte";
import {
  fetchReport,
  publishTitle,
  pullReport,
  pushReport,
  pushTagsReport,
  syncReport,
  upstreamRemote,
} from "$lib/notifications/gitReport";
import type { AppError, HeadInfo } from "$lib/types";
import { dialogs } from "$lib/ui/dialog.svelte";
import { toast } from "$lib/ui/toast.svelte";
import { commitFieldFor } from "./changes/commitFields";
import { changesLayout } from "./changes/layout.svelte";
import { changesSelection } from "./changes/selection.svelte";
import { syncPlan } from "./changes/sync";

/** A copy of the branch state before an operation, for its message (the refresh after it replaces the state). */
function headOf(repoRoot?: string): HeadInfo | null {
  const root = repoRoot ?? repoStore.repo?.root;
  const head = root ? (repoStore.statuses[root]?.head ?? null) : null;
  return head ? { ...head } : null;
}

/** Fetches every remote and prunes deleted branches. */
export function fetchAll(repoRoot?: string): Promise<unknown> {
  const head = headOf(repoRoot);
  return repoStore.runOp(
    "Fetch",
    (repoPath) => api.fetchAll(repoPath),
    (outcome) => fetchReport(outcome.output, head, true),
    repoRoot,
    "Could not fetch all remotes",
  );
}

/** Fetches the default remote; `prune` also drops branches deleted there. */
export function fetchRemote(repoRoot?: string, prune = false): Promise<unknown> {
  const head = headOf(repoRoot);
  return repoStore.runOp(
    "Fetch",
    (repoPath) => api.fetch(repoPath, prune),
    (outcome) => fetchReport(outcome.output, head, false, prune),
    repoRoot,
    `Could not fetch ${upstreamRemote(head) ?? "the remote"}`,
  );
}

export function pull(repoRoot?: string, rebase = false): Promise<unknown> {
  const head = headOf(repoRoot);
  return repoStore.runOp(
    "Pull",
    (repoPath) => api.pull(repoPath, rebase),
    (outcome) => pullReport(outcome.output, head, rebase),
    repoRoot,
    `Could not pull into ${head?.branch ?? "HEAD"}`,
  );
}

/** Pushes the current branch; `askForce` first offers a force push with --force-with-lease. */
export async function push(askForce = false, repoRoot?: string): Promise<void> {
  let force = false;
  if (askForce) {
    force = await dialogs.confirm({
      title: "Force Push",
      message: `Force push ${headOf(repoRoot)?.branch ?? "this branch"} with --force-with-lease? Commits on the remote that you do not have will be lost.`,
      confirmLabel: "Force Push",
      danger: true,
    });
    if (!force) {
      return;
    }
  }
  const head = headOf(repoRoot);
  await repoStore.runOp(
    "Push",
    (repoPath) => api.push(repoPath, force),
    (outcome) => pushReport(outcome.output, head, force),
    repoRoot,
    `Could not push ${head?.branch ?? "HEAD"}`,
  );
}

/** Pushes a branch that has no upstream yet and tracks it. */
export async function publishBranch(repoRoot?: string): Promise<boolean> {
  const head = headOf(repoRoot);
  const branchName = head?.branch ?? "branch";
  const outcome = await repoStore.runOp(
    "Publish",
    (repoPath) => api.push(repoPath, false),
    (done) => ({ ...pushReport(done.output, head), title: publishTitle(branchName, done.output) }),
    repoRoot,
    `Could not publish ${branchName}`,
  );
  return outcome !== undefined;
}

export function pushTags(repoRoot?: string): Promise<unknown> {
  const head = headOf(repoRoot);
  return repoStore.runOp(
    "Push tags",
    (repoPath) => api.pushTags(repoPath),
    (outcome) => pushTagsReport(outcome.output, head),
    repoRoot,
    "Could not push tags",
  );
}

/**
 * Sync Changes: pull what the upstream has, then push what this
 * branch has; a branch without an upstream is published instead. A pull that
 * stops on conflicts stops the sync there (the Conflicts dialog opens).
 * Resolves true when everything went through.
 */
export async function syncRepo(repoRoot: string): Promise<boolean> {
  const head = headOf(repoRoot);
  const plan = syncPlan(repoStore.statuses[repoRoot]?.head);
  if (plan.kind === "none") {
    return true;
  }
  if (plan.kind === "publish") {
    return publishBranch(repoRoot);
  }
  if (plan.pull > 0) {
    const pulled = await repoStore.runOp(
      "Pull",
      (repoPath) => api.pull(repoPath),
      undefined,
      repoRoot,
      `Could not pull into ${head?.branch ?? "HEAD"}`,
    );
    if (!pulled || pulled.conflicts) {
      return false;
    }
    await repoStore.refreshRepoStatus(repoRoot);
  }
  // A pull can add a merge commit, so count again before pushing.
  const ahead = repoStore.statuses[repoRoot]?.head?.ahead ?? plan.push;
  if (ahead > 0) {
    const pushed = await repoStore.runOp(
      "Push",
      (repoPath) => api.push(repoPath, false),
      undefined,
      repoRoot,
      `Could not push ${head?.branch ?? "HEAD"}`,
    );
    if (!pushed) {
      return false;
    }
  }
  const report = syncReport(head, plan.pull, ahead);
  toast.show(report.kind, report.title, report.detail ?? undefined, { source: repoStore.notificationSource(repoRoot) });
  return true;
}

/**
 * Stashes the changes after asking for a message. With `includeUntracked`
 * undefined the dialog offers it as a checkbox (the Git menu); the Changes
 * view's Stash and Stash (Include Untracked) items decide it up front.
 */
export async function stash(repoRoot?: string, includeUntracked?: boolean): Promise<void> {
  const result = await dialogs.prompt({
    title: includeUntracked ? "Stash (Include Untracked)" : "Stash Changes",
    label: "Message",
    placeholder: "WIP",
    initial: "WIP",
    confirmLabel: "Stash",
    checkbox: includeUntracked === undefined ? { label: "Include untracked files", checked: true } : undefined,
  });
  if (!result) {
    return;
  }
  const withUntracked = includeUntracked ?? result.checked;
  // Nothing to stash comes back as an "invalid" error: a note, not a failure.
  const branchName = headOf(repoRoot)?.branch ?? "HEAD";
  let nothingToStash: string | null = null;
  await repoStore.run(
    "Stash",
    async (repoPath) => {
      try {
        await api.stashPush(repoPath, result.value, withUntracked);
        return true;
      } catch (error) {
        if ((error as Partial<AppError> | null)?.kind === "invalid") {
          nothingToStash = errorMessage(error);
          return false;
        }
        throw error;
      }
    },
    {
      success: (stashed) =>
        stashed
          ? { title: `Stashed changes on ${branchName}`, detail: result.value.trim() || null, kind: "success" }
          : null,
      repoPath: repoRoot,
    },
  );
  if (nothingToStash) {
    toast.info(nothingToStash, undefined, repoRoot ? repoStore.notificationSource(repoRoot) : null);
  }
}

/** Shows the Changes panel and puts the caret in the commit message, targeting `repoRoot` when given. */
export async function focusCommitMessage(repoRoot?: string): Promise<void> {
  if (repoRoot) {
    changesLayout.focusRepo(repoRoot);
  }
  settings.setLeftPanel("changes");
  await tick();
  commitFieldFor(repoRoot)?.focus();
}

/** Opens the Log, switching the active repository to `repoRoot` first when given. */
export async function showLog(repoRoot?: string): Promise<void> {
  if (repoRoot) {
    await repoStore.setActiveRepo(repoRoot);
  }
  if (!changesSelection.logShown) {
    changesSelection.toggleLog();
  }
}
