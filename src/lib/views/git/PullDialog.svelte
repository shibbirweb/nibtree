<!-- The Pull dialog: the remote and branch to pull, and how: merge (the default),
     rebase or fast-forward only, with "No commit" for a merge. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import CodeBlock from "@nibtree/ui/components/CodeBlock.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Fieldset from "@nibtree/ui/components/Fieldset.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import RadioGroup from "@nibtree/ui/components/RadioGroup.svelte";
  import Select from "@nibtree/ui/components/Select.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { api } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { PullMode } from "$lib/types";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { defaultRemote, PULL_MODES, pullCommand, splitRemoteRef } from "./gitOptions";

  interface Props {
    repoRoot: string;
  }

  let { repoRoot }: Props = $props();

  const refs = $derived(repoRoot === repoStore.repo?.root ? repoStore.refs : null);
  const remoteNames = $derived(refs?.remotes ?? repoStore.remotes.map((remote) => remote.name));
  const head = $derived(repoStore.statuses[repoRoot]?.head ?? null);

  const initial = untrack(() => {
    const names = refs?.remotes ?? repoStore.remotes.map((remote) => remote.name);
    const upstream = head?.upstream ? splitRemoteRef(head.upstream, names) : null;
    return {
      remoteName: upstream?.remoteName ?? defaultRemote(names) ?? "",
      branchName: upstream?.remoteBranch ?? head?.branch ?? "",
    };
  });

  let remoteName = $state(initial.remoteName);
  let branchName = $state(initial.branchName);
  let mode = $state<PullMode>("merge");
  let noCommit = $state(false);

  const branches = $derived(
    (refs?.remote ?? [])
      .filter((remoteBranch) => remoteBranch.remote === remoteName)
      .map((remoteBranch) => remoteBranch.branch),
  );
  const command = $derived(
    pullCommand({ remoteName: remoteName || null, branchName: branchName || null, mode, noCommit }),
  );
  const canPull = $derived(
    remoteName !== "" && branchName.trim() !== "" && head?.branch != null && repoStore.busy === null,
  );

  // A remote without the chosen branch: take its branch of the same name as HEAD, else its first one.
  $effect(() => {
    const list = branches;
    untrack(() => {
      if (list.length > 0 && !list.includes(branchName)) {
        branchName = list.find((name) => name === head?.branch) ?? list[0];
      }
    });
  });

  function close(): void {
    gitDialogs.close();
  }

  async function submit(): Promise<void> {
    if (!canPull) {
      return;
    }
    const options = { remoteName, branchName: branchName.trim(), mode, noCommit: noCommit && mode === "merge" };
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await repoStore.runOp(
      "Pull",
      (repoPath) =>
        api.pullWithOptions(repoPath, options.remoteName, options.branchName, options.mode, options.noCommit),
      options.noCommit
        ? "Merged without committing: review and commit"
        : `Pulled ${options.remoteName}/${options.branchName}`,
      targetRepo,
    );
  }
</script>

<Dialog
  open
  variant="form"
  title="Pull to {head?.branch ?? 'HEAD'}"
  width="normal"
  onclose={close}
  onsubmit={() => void submit()}
>
  {#if !head?.branch}
    <Text size="small" tone="danger">HEAD is detached: check out a branch to pull into it.</Text>
  {:else if remoteNames.length === 0}
    <Text size="small" tone="danger">This repository has no remote. Add one with Git > Manage Remotes.</Text>
  {:else}
    <Stack direction="row" gap="md">
      <Field label="Remote" look="compact">
        <Select
          label="Remote"
          width="medium"
          bind:value={remoteName}
          options={remoteNames.map((name) => ({ value: name, label: name }))}
        />
      </Field>
      <Stack grow>
        <Field label="Branch" look="compact">
          {#if branches.length > 0}
            <Select
              label="Branch"
              width="fill"
              bind:value={branchName}
              options={branches.map((name) => ({ value: name, label: name }))}
            />
          {:else}
            <Input mono width="fill" bind:value={branchName} spellcheck="false" autocomplete="off" placeholder="main" />
          {/if}
        </Field>
      </Stack>
    </Stack>

    <Fieldset legend="Integrate the incoming changes with">
      <RadioGroup name="pull-mode" label="Pull mode" layout="columns" bind:value={mode} options={PULL_MODES} />
    </Fieldset>
    <Checkbox
      bind:checked={noCommit}
      disabled={mode !== "merge"}
      label="No commit (--no-commit): stop before the merge commit"
    />
    <CodeBlock variant="command" text={command} label="Command" />
  {/if}

  {#snippet footnote()}
    <Text variant="hint" tone="faint">{localKeys("CmdOrCtrl+Enter")} to pull</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canPull} onclick={() => void submit()}>Pull</Button>
  {/snippet}
</Dialog>
