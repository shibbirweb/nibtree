<!-- The Push dialog: the commits the current branch would push, the target remote and
     branch, Force push (--force-with-lease) and Push tags. A branch without an upstream gets one. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import CodeBlock from "@nibtree/ui/components/CodeBlock.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import ListBox from "@nibtree/ui/components/ListBox.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import Select from "@nibtree/ui/components/Select.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { api, errorMessage } from "$lib/api";
  import { relativeTime } from "$lib/log/format";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { OutgoingCommits } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { defaultPushTarget, isValidRefName, pushCommand } from "./gitOptions";

  interface Props {
    repoRoot: string;
  }

  let { repoRoot }: Props = $props();

  const status = $derived(repoStore.statuses[repoRoot] ?? null);
  const head = $derived(status?.head ?? null);
  const localBranch = $derived(head?.branch ?? null);
  const remoteNames = $derived(remoteNamesOf(repoRoot));
  const initialTarget = untrack(() => defaultPushTarget(repoStore.statuses[repoRoot]?.head, remoteNamesOf(repoRoot)));

  let remoteName = $state(initialTarget?.remoteName ?? "");
  let remoteBranch = $state(initialTarget?.remoteBranch ?? "");
  let forceWithLease = $state(false);
  let pushTags = $state(false);
  let outgoing = $state.raw<OutgoingCommits | null>(null);
  let loadError = $state<string | null>(null);
  let loading = $state(false);
  let loadToken = 0;
  const now = Date.now();

  function remoteNamesOf(targetRoot: string): string[] {
    return targetRoot === repoStore.repo?.root && repoStore.refs
      ? repoStore.refs.remotes
      : repoStore.remotes.map((remote) => remote.name);
  }

  const setUpstream = $derived(!head?.upstream);
  const branchError = $derived(
    remoteBranch.trim() === ""
      ? "Enter the remote branch"
      : isValidRefName(remoteBranch.trim())
        ? null
        : "Not a valid branch name",
  );
  const canPush = $derived(
    localBranch !== null && remoteName !== "" && branchError === null && repoStore.busy === null,
  );
  const command = $derived(
    localBranch
      ? pushCommand({
          localBranch,
          remoteName: remoteName || "origin",
          remoteBranch: remoteBranch.trim(),
          forceWithLease,
          pushTags,
          setUpstream,
        })
      : "",
  );

  // The outgoing commits follow the target, after a short pause while typing.
  $effect(() => {
    const targetRemote = remoteName;
    const targetBranch = remoteBranch.trim();
    if (!targetRemote || !targetBranch) {
      outgoing = null;
      return;
    }
    const timer = setTimeout(() => void loadOutgoing(targetRemote, targetBranch), 200);
    return () => clearTimeout(timer);
  });

  async function loadOutgoing(targetRemote: string, targetBranch: string): Promise<void> {
    const token = ++loadToken;
    loading = true;
    try {
      const result = await api.outgoingCommits(repoRoot, targetRemote, targetBranch);
      if (token === loadToken) {
        outgoing = result;
        loadError = null;
      }
    } catch (error) {
      if (token === loadToken) {
        outgoing = null;
        loadError = errorMessage(error);
      }
    } finally {
      if (token === loadToken) {
        loading = false;
      }
    }
  }

  function close(): void {
    gitDialogs.close();
  }

  async function submit(): Promise<void> {
    const branch = localBranch;
    const targetBranch = remoteBranch.trim();
    if (!canPush || !branch) {
      return;
    }
    if (forceWithLease) {
      const confirmed = await dialogs.confirm({
        title: "Force Push",
        message:
          `Force push ${branch} to ${remoteName}/${targetBranch} with --force-with-lease? Commits on the remote ` +
          "that you do not have will be lost.",
        confirmLabel: "Force Push",
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }
    const force = forceWithLease;
    const tags = pushTags;
    const targetRemote = remoteName;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await repoStore.runOp(
      "Push",
      (repoPath) => api.pushWithOptions(repoPath, targetRemote, targetBranch, force, tags),
      force ? `Force pushed ${branch}` : `Pushed ${branch} to ${targetRemote}/${targetBranch}`,
      targetRepo,
    );
  }
</script>

<Dialog open variant="form" title="Push Commits" width="large" onclose={close} onsubmit={() => void submit()}>
  {#if !localBranch}
    <Text size="small" tone="danger">HEAD is detached: check out a branch to push it.</Text>
  {:else if remoteNames.length === 0}
    <Text size="small" tone="danger">This repository has no remote. Add one with Git > Manage Remotes.</Text>
  {:else}
    <Field look="compact" error={branchError && remoteBranch !== "" ? branchError : null}>
      <Stack direction="row" align="center" gap="md" wrap>
        <Text mono weight="semibold">{localBranch}</Text>
        <Text tone="dim">&rarr;</Text>
        <Select
          label="Remote"
          width="small"
          bind:value={remoteName}
          options={remoteNames.map((name) => ({ value: name, label: name }))}
        />
        <Text tone="dim">:</Text>
        <Stack grow>
          <Input
            mono
            width="fill"
            bind:value={remoteBranch}
            aria-label="Remote branch"
            spellcheck="false"
            autocomplete="off"
            autofocus
          />
        </Stack>
        {#if setUpstream}
          <Text variant="hint" tone="faint">new, sets upstream</Text>
        {/if}
      </Stack>
    </Field>

    <ListBox label="Commits to push" maxHeight="medium" minHeight="list">
      {#if loadError}
        <Stack paddingX="mdPlus" paddingY="lgPlus"><Text size="small" tone="danger">{loadError}</Text></Stack>
      {:else if !outgoing}
        <Stack paddingX="mdPlus" paddingY="lgPlus"><Text tone="dim">{loading ? "Reading commits..." : ""}</Text></Stack>
      {:else if outgoing.commits.length === 0}
        <Stack paddingX="mdPlus" paddingY="lgPlus">
          <Text tone="dim">Nothing to push: {outgoing.base ?? "the remote"} has every commit.</Text>
        </Stack>
      {:else}
        {#each outgoing.commits as commit (commit.id)}
          <Row size="history" line title={commit.summary}>
            <Stack grow><Text truncate>{commit.summary}</Text></Stack>
            <Stack width="large"><Text tone="dim" truncate>{commit.authorName}</Text></Stack>
            <Stack width="small"><Text size="small" tone="dim">{relativeTime(commit.time, now)}</Text></Stack>
            <Stack width="xsmall" align="end"><Text mono size="compact" tone="dim">{commit.shortId}</Text></Stack>
          </Row>
        {/each}
      {/if}
    </ListBox>
    {#if outgoing && outgoing.commits.length > 0}
      <Text variant="hint" tone="faint">
        {outgoing.commits.length}{outgoing.truncated ? "+" : ""}
        {outgoing.commits.length === 1 ? "commit" : "commits"}
        {outgoing.base ? `not on ${outgoing.base}` : "on no remote yet"}
      </Text>
    {/if}

    <Stack direction="row" gap="xl">
      <Checkbox bind:checked={forceWithLease} label="Force push (--force-with-lease)" />
      <Checkbox bind:checked={pushTags} label="Push tags" />
    </Stack>
    <CodeBlock variant="command" text={command} label="Command" />
  {/if}

  {#snippet footnote()}
    <Text variant="hint" tone="faint">{localKeys("CmdOrCtrl+Enter")} to push</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant={forceWithLease ? "danger-primary" : "primary"} disabled={!canPush} onclick={() => void submit()}>
      {forceWithLease ? "Force Push" : "Push"}
    </Button>
  {/snippet}
</Dialog>
