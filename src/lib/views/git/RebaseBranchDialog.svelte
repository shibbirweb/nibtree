<!-- The Rebase dialog: "Rebase BRANCH" onto a branch or commit, with --interactive
     (opens the Interactive Rebase dialog), --rebase-merges, --keep-empty, --root,
     --update-refs and --onto with an upstream for the three-argument form. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import CodeBlock from "@nibtree/ui/components/CodeBlock.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import Select from "@nibtree/ui/components/Select.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { onMount, untrack } from "svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { Refs } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { toast } from "$lib/ui/toast.svelte";
  import { decodeRefPick, refPickItems } from "../changes/repoPickers";
  import { loadDetails } from "../changes/repoActions";
  import { gitDialogs } from "./gitDialogs.svelte";
  import {
    DEFAULT_REBASE_OPTIONS,
    REBASE_FLAGS,
    type RebaseDialogOptions,
    type RebaseFlag,
    rebaseCommand,
    rebaseFlagDisabled,
    rebaseRequest,
    toggleRebaseFlag,
    validateRebase,
  } from "./integrateOptions";

  interface Props {
    repoRoot: string;
    onto: string | null;
  }

  let { repoRoot, onto: initialOnto }: Props = $props();

  let refs = $state.raw<Refs | null>(null);
  let options = $state<RebaseDialogOptions>(untrack(() => ({ ...DEFAULT_REBASE_OPTIONS, onto: initialOnto })));
  let starting = $state(false);

  const status = $derived(repoStore.statuses[repoRoot] ?? null);
  const current = $derived(status?.head.branch ?? null);
  const branchLabel = $derived(options.branchName || current || "HEAD");
  const operation = $derived((status?.op.kind ?? "none") !== "none");
  const error = $derived(validateRebase(options));
  const interactiveElsewhere = $derived(
    options.interactive && options.branchName !== null && options.branchName !== current,
  );
  const command = $derived(rebaseCommand(options));
  const canStart = $derived(
    error === null && !interactiveElsewhere && !operation && !starting && repoStore.busy === null,
  );
  const localBranches = $derived((refs?.local ?? []).map((branch) => branch.name));
  const branchChoices = $derived([
    { value: "", label: current ? `${current} (current)` : "HEAD (detached)" },
    ...localBranches.filter((name) => name !== current).map((name) => ({ value: name, label: name })),
  ]);

  onMount(() => {
    void loadDetails(repoRoot).then((details) => {
      refs = details.refs;
    });
  });

  function close(): void {
    gitDialogs.close();
  }

  function setFlag(flag: RebaseFlag, on: boolean): void {
    options = toggleRebaseFlag(options, flag, on);
  }

  async function choose(field: "onto" | "upstream"): Promise<void> {
    const picked = decodeRefPick(
      await dialogs.pick({
        title: field === "onto" ? `Rebase ${branchLabel} onto` : "Upstream: the commits after it move",
        placeholder: "Select a branch or tag",
        items: refPickItems(refs, { local: true, remote: true, tags: true, skipCurrent: true }),
        emptyText: "No other branches",
      }),
    );
    if (picked && picked.kind !== "create" && picked.kind !== "createFrom") {
      options = { ...options, [field]: picked.name };
    }
  }

  async function startInteractive(upstream: string): Promise<void> {
    starting = true;
    try {
      const plan = await api.rebasePlanOnto(repoRoot, upstream);
      if (plan.commits.length === 0) {
        toast.info(`${current ?? "HEAD"} has no commits that ${upstream} lacks`);
        return;
      }
      gitDialogs.open({ kind: "rebase", repoRoot, plan });
    } catch (failure) {
      toast.error("Could not start the interactive rebase", errorMessage(failure));
    } finally {
      starting = false;
    }
  }

  async function submit(): Promise<void> {
    if (!canStart) {
      return;
    }
    const onto = (options.onto ?? "").trim();
    if (options.interactive) {
      await startInteractive(onto);
      return;
    }
    const request = rebaseRequest(options);
    const label = branchLabel;
    const target = request.root && !request.useOnto ? "its root" : (request.onto ?? onto);
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    close();
    await repoStore.runOp(
      "Rebase",
      (repoPath) => api.rebaseWithOptions(repoPath, request),
      `Rebased ${label} onto ${target}`,
      targetRepo,
    );
  }
</script>

<Dialog open variant="form" title="Rebase {branchLabel}" width="medium" onclose={close} onsubmit={() => void submit()}>
  {#if operation}
    <Text size="small" tone="danger">
      Finish or abort the {status?.op.description ?? "operation"} in progress first.
    </Text>
  {/if}
  <Field label="Branch to rebase" look="compact">
    <Select
      label="Branch to rebase"
      width="fill"
      value={options.branchName ?? ""}
      onchange={(value) => (options = { ...options, branchName: value || null })}
      options={branchChoices}
    />
  </Field>
  {#if !options.root || options.useOnto}
    {@const ontoLabel = options.useOnto ? "New base (--onto)" : "Onto branch or commit"}
    <Field label={ontoLabel} look="compact">
      <Stack direction="row" align="center" gap="md">
        <Input
          mono
          width="fill"
          value={options.onto ?? ""}
          oninput={(event) => (options = { ...options, onto: event.currentTarget.value })}
          placeholder="main"
          spellcheck="false"
          autocomplete="off"
          aria-label={ontoLabel}
          autofocus
        />
        <Button onclick={() => void choose("onto")}>Choose...</Button>
      </Stack>
    </Field>
  {/if}
  {#if options.useOnto && !options.root}
    <Field label="Upstream: only the commits after it move" look="compact">
      <Stack direction="row" align="center" gap="md">
        <Input
          mono
          width="fill"
          value={options.upstream ?? ""}
          oninput={(event) => (options = { ...options, upstream: event.currentTarget.value })}
          placeholder="old-base"
          spellcheck="false"
          autocomplete="off"
          aria-label="Upstream: only the commits after it move"
        />
        <Button onclick={() => void choose("upstream")}>Choose...</Button>
      </Stack>
    </Field>
  {/if}
  <Stack gap="xs">
    {#each REBASE_FLAGS as entry (entry.flag)}
      <Checkbox
        checked={options[entry.flag]}
        disabled={rebaseFlagDisabled(options, entry.flag)}
        onchange={(checked) => setFlag(entry.flag, checked)}
      >
        <Stack element="span" direction="row" align="center" gap="xs">
          <Stack element="span" width="large"><Text mono>{entry.label}</Text></Stack>
          <Text variant="hint" tone="faint">{entry.description}</Text>
        </Stack>
      </Checkbox>
    {/each}
  </Stack>
  {#if options.interactive}
    <Text variant="hint" tone="faint">Merge commits in the range are kept automatically.</Text>
  {/if}
  {#if interactiveElsewhere}
    <Text size="small" tone="danger">
      --interactive rebases the checked-out branch: check out {options.branchName} first.
    </Text>
  {:else if error && ((options.onto ?? "") !== "" || options.useOnto)}
    <Text size="small" tone="danger">{error}</Text>
  {/if}
  <CodeBlock variant="command" text={command} label="Command" />

  {#snippet footnote()}
    <Text variant="hint" tone="faint">{localKeys("CmdOrCtrl+Enter")} to rebase</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canStart} onclick={() => void submit()}>
      {options.interactive ? "Next..." : "Rebase"}
    </Button>
  {/snippet}
</Dialog>
