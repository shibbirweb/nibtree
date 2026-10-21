<!-- The Merge dialog: "Merge into BRANCH", the branch to merge, the merge options,
     the commit message when a merge commit can be made, and the command it runs. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import CodeBlock from "@nibtree/ui/components/CodeBlock.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import TextArea from "@nibtree/ui/components/TextArea.svelte";
  import { onMount, untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { api } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { MergeOptions, Refs } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { decodeRefPick, refPickItems } from "../changes/repoPickers";
  import { loadDetails } from "../changes/repoActions";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { validateRevision } from "./gitOptions";
  import {
    DEFAULT_MERGE_OPTIONS,
    MERGE_FLAGS,
    type MergeFlag,
    mergeCommand,
    mergeDoneMessage,
    mergeRequest,
    mergeShowsMessage,
    toggleMergeFlag,
  } from "./integrateOptions";

  interface Props {
    repoRoot: string;
    branchName: string | null;
  }

  let { repoRoot, branchName: initialBranch }: Props = $props();

  let refs = $state.raw<Refs | null>(null);
  let branchName = $state(untrack(() => initialBranch ?? ""));
  let options = $state<MergeOptions>({ ...DEFAULT_MERGE_OPTIONS });

  const status = $derived(repoStore.statuses[repoRoot] ?? null);
  const current = $derived(status?.head.branch ?? "HEAD");
  const operation = $derived((status?.op.kind ?? "none") !== "none");
  const branchError = $derived(branchName.trim() === "" ? null : validateRevision(branchName));
  const command = $derived(mergeCommand(branchName, options));
  const canMerge = $derived(branchName.trim() !== "" && branchError === null && !operation && repoStore.busy === null);

  onMount(() => {
    void loadDetails(repoRoot).then((details) => {
      refs = details.refs;
    });
  });

  function close(): void {
    gitDialogs.close();
  }

  function setFlag(flag: MergeFlag, on: boolean): void {
    options = toggleMergeFlag(options, flag, on);
  }

  async function chooseBranch(): Promise<void> {
    const picked = decodeRefPick(
      await dialogs.pick({
        title: `Merge into ${current}`,
        placeholder: "Select a branch or tag to merge",
        items: refPickItems(refs, { local: true, remote: true, tags: true, skipCurrent: true }),
        emptyText: "No other branches",
      }),
    );
    if (picked && picked.kind !== "create" && picked.kind !== "createFrom") {
      branchName = picked.name;
    }
  }

  async function submit(): Promise<void> {
    if (!canMerge) {
      return;
    }
    const target = branchName.trim();
    const request = mergeRequest(options);
    const into = current;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await repoStore.runOp(
      "Merge",
      (repoPath) => api.mergeWithOptions(repoPath, target, request),
      mergeDoneMessage(target, into, request),
      targetRepo,
    );
  }
</script>

<Dialog open variant="form" title="Merge into {current}" width="medium" onclose={close} onsubmit={() => void submit()}>
  {#if operation}
    <Text size="small" tone="danger">
      Finish or abort the {status?.op.description ?? "operation"} in progress first.
    </Text>
  {/if}
  <Field label="Branch to merge" look="compact" error={branchError || null}>
    <Stack direction="row" align="center" gap="md">
      <Input
        mono
        width="fill"
        bind:value={branchName}
        placeholder="feature/my-change"
        spellcheck="false"
        autocomplete="off"
        aria-label="Branch to merge"
        autofocus
      />
      <Button onclick={() => void chooseBranch()}>Choose...</Button>
    </Stack>
  </Field>
  <Stack gap="xs">
    {#each MERGE_FLAGS as entry (entry.flag)}
      <Checkbox checked={options[entry.flag]} onchange={(checked) => setFlag(entry.flag, checked)}>
        <Stack element="span" direction="row" align="center" gap="xs">
          <Stack element="span" width="medium"><Text mono>{entry.label}</Text></Stack>
          <Text variant="hint" tone="faint">{entry.description}</Text>
        </Stack>
      </Checkbox>
    {/each}
  </Stack>
  {#if mergeShowsMessage(options)}
    <Field label="Commit message (-m)" look="compact">
      <TextArea
        rows="normal"
        resize="vertical"
        value={options.message ?? ""}
        oninput={(event) => (options = { ...options, message: event.currentTarget.value })}
        placeholder="Merge branch '{branchName.trim() || 'branch'}' into {current}"
        spellcheck="true"
      />
    </Field>
  {/if}
  <CodeBlock variant="command" text={command} label="Command" />

  {#snippet footnote()}
    <Text variant="hint" tone="faint">{localKeys("CmdOrCtrl+Enter")} to merge</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canMerge} onclick={() => void submit()}>Merge</Button>
  {/snippet}
</Dialog>
