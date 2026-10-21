<!-- The Reset HEAD dialog: the revision to reset the current branch to (HEAD, a commit
     id or a branch) and the mode, each with its one-line explanation. Hard asks first. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Fieldset from "@nibtree/ui/components/Fieldset.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import RadioGroup from "@nibtree/ui/components/RadioGroup.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { CommitSummary, ResetMode } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { decodeRefPick, refPickItems } from "../changes/repoPickers";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { RESET_MODES, validateRevision } from "./gitOptions";
  import { undoAction } from "./undoActions";

  interface Props {
    repoRoot: string;
    /** Filled in when opened from a commit, e.g. the reflog's Reset Current Branch to Here. */
    initialRevision?: string | null;
  }

  let { repoRoot, initialRevision = null }: Props = $props();

  // The dialog opens once per request, so the prop is only read at the start.
  let revision = $state(untrack(() => initialRevision) ?? "HEAD");
  let mode = $state<ResetMode>("mixed");
  let resolved = $state<{ revision: string; commitId: string } | null>(null);
  let resolveError = $state<string | null>(null);
  let resolveToken = 0;

  const branch = $derived(repoStore.statuses[repoRoot]?.head.branch ?? "HEAD");
  const revisionError = $derived(validateRevision(revision));
  const canReset = $derived(
    revisionError === null &&
      resolved?.revision === revision.trim() &&
      resolveError === null &&
      repoStore.busy === null,
  );

  $effect(() => {
    const text = revision.trim();
    if (validateRevision(text) !== null) {
      resolved = null;
      resolveError = null;
      return;
    }
    const timer = setTimeout(() => void resolve(text), 150);
    return () => clearTimeout(timer);
  });

  async function resolve(text: string): Promise<void> {
    const token = ++resolveToken;
    try {
      const commitId = await api.resolveRevision(repoRoot, text);
      if (token === resolveToken) {
        resolved = { revision: text, commitId };
        resolveError = null;
      }
    } catch (error) {
      if (token === resolveToken) {
        resolved = null;
        resolveError = errorMessage(error);
      }
    }
  }

  async function pickBranch(): Promise<void> {
    const refs = repoRoot === repoStore.repo?.root ? repoStore.refs : await api.getRefs(repoRoot).catch(() => null);
    const picked = decodeRefPick(
      await dialogs.pick({
        title: "Reset to Branch or Tag",
        placeholder: "Select a branch or tag",
        items: refPickItems(refs, { local: true, remote: true, tags: true, skipCurrent: true }),
        emptyText: "No other branches",
      }),
    );
    if (picked && picked.kind !== "create" && picked.kind !== "createFrom") {
      revision = picked.name;
    }
  }

  async function pickCommit(): Promise<void> {
    const commits: CommitSummary[] = await api.getLog(repoRoot, 0, 200, false).catch(() => []);
    const commitId = await dialogs.pick({
      title: "Reset to Commit",
      placeholder: "Filter by message, author or hash",
      items: commits.map((commit) => ({
        value: commit.id,
        label: commit.summary || commit.shortId,
        description: `${commit.shortId}  ${commit.authorName}`,
      })),
      emptyText: "No commits",
    });
    if (commitId) {
      revision = commitId;
    }
  }

  function close(): void {
    gitDialogs.close();
  }

  async function submit(): Promise<void> {
    const target = resolved;
    if (!canReset || !target) {
      return;
    }
    const shortId = target.commitId.slice(0, 8);
    if (mode === "hard") {
      const confirmed = await dialogs.confirm({
        title: "Hard Reset",
        message:
          `Reset ${branch} to ${target.revision} (${shortId}) and discard every uncommitted change? ` +
          "This cannot be undone.",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }
    const resetMode = mode;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    const resetBranch = branch;
    close();
    await repoStore.run("Reset", (repoPath) => api.resetTo(repoPath, target.commitId, resetMode), {
      repoPath: targetRepo,
      success: `Reset ${resetBranch} to ${shortId} (${resetMode})`,
      action: () => undoAction(targetRepo, ["reset"]),
    });
  }
</script>

<Dialog open variant="form" title="Reset HEAD" width="medium" onclose={close} onsubmit={() => void submit()}>
  <Field
    label="Reset {branch} to"
    look="compact"
    error={revisionError && revision !== "" ? revisionError : resolveError || null}
    hint={resolved ? `Commit ${resolved.commitId.slice(0, 8)}` : ""}
  >
    <Stack direction="row" align="center" gap="md">
      <Input
        mono
        width="fill"
        bind:value={revision}
        spellcheck="false"
        autocomplete="off"
        placeholder="HEAD, a commit id or a branch"
        aria-label="Reset {branch} to"
      />
      <Button onclick={() => void pickCommit()}>Commit...</Button>
      <Button onclick={() => void pickBranch()}>Branch...</Button>
    </Stack>
  </Field>

  <Fieldset legend="Reset type">
    <RadioGroup name="reset-mode" label="Reset type" bind:value={mode} options={RESET_MODES} />
  </Fieldset>

  {#snippet footnote()}
    <Text variant="hint" tone="faint">{localKeys("CmdOrCtrl+Enter")} to reset</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant={mode === "hard" ? "danger-primary" : "primary"} disabled={!canReset} onclick={() => void submit()}>
      Reset
    </Button>
  {/snippet}
</Dialog>
