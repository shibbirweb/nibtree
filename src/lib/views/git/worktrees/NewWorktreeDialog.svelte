<!-- New Worktree: an existing branch, or a new branch from a base; the folder (next to the
     repository by default, following the branch until edited); then open it here, add it to the
     workspace, or (from the AI panel) start an agent in it. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Checkbox from "@nibtree/ui/components/Checkbox.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import RadioGroup from "@nibtree/ui/components/RadioGroup.svelte";
  import Select from "@nibtree/ui/components/Select.svelte";
  import Spinner from "@nibtree/ui/components/Spinner.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { onMount, untrack } from "svelte";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { baseName, fromNativePath, joinPath } from "$lib/stores/workspacePaths";
  import type { Refs, WorktreeBranch, WorktreeInfo } from "$lib/types";
  import { toast } from "$lib/ui/toast.svelte";
  import { repoTarget, validateBranchName } from "../../sidebar/actions";
  import { gitDialogs } from "../gitDialogs.svelte";
  import { availableBranches, defaultWorktreePath, mainWorktreeRoot, validateWorktreePath } from "./worktreeModel";
  import { worktreeStore } from "./worktreeStore.svelte";
  import { aiStore } from "$lib/ai/aiStore.svelte";
  import { agentPrograms, startAgent as startAgentIn } from "$lib/ai/sessions.svelte";

  interface Props {
    repoRoot: string;
    /** Opened from the AI panel: offers to start an agent in the new worktree. */
    startAgent?: boolean;
  }

  let { repoRoot, startAgent = false }: Props = $props();
  /** The agent to start in the new worktree, or "" for none. */
  let agentChoice = $state(untrack(() => (startAgent ? (agentPrograms.installed()[0]?.id ?? "") : "")));

  let refs = $state.raw<Refs | null>(untrack(() => (repoRoot === repoStore.repo?.root ? repoStore.refs : null)));
  let worktrees = $state.raw<WorktreeInfo[]>([]);
  let mode = $state<"existing" | "new">("new");
  let existingBranch = $state("");
  let newBranch = $state("");
  let baseRef = $state(untrack(() => repoStore.statuses[repoRoot]?.head.branch ?? "HEAD"));
  let folder = $state("");
  /** The folder follows the branch until the user edits it. */
  let folderEdited = $state(false);
  let afterCreate = $state<"open" | "add" | "none">("none");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  const mainRoot = $derived(mainWorktreeRoot(worktrees, repoRoot));
  const localNames = $derived((refs?.local ?? []).map((branch) => branch.name));
  const checkoutable = $derived(availableBranches(localNames, worktrees));
  const baseChoices = $derived(["HEAD", ...localNames, ...(refs?.remote ?? []).map((branch) => branch.name)]);
  const branchName = $derived(mode === "existing" ? existingBranch : newBranch.trim());
  const branchError = $derived(
    mode === "existing"
      ? existingBranch === ""
        ? "Choose a branch"
        : null
      : newBranch.trim() === ""
        ? "Enter a branch name"
        : validateBranchName(newBranch.trim(), null, repoTarget(repoRoot, refs)),
  );
  const folderError = $derived(validateWorktreePath(folder, worktrees));
  const canCreate = $derived(!creating && branchError === null && folderError === null && repoStore.busy === null);

  onMount(() => {
    void Promise.all([
      refs ? Promise.resolve(refs) : api.getRefs(repoRoot).catch(() => null),
      worktreeStore.listFor(repoRoot),
    ]).then(([loadedRefs, loadedWorktrees]) => {
      refs = loadedRefs;
      worktrees = loadedWorktrees;
      if (existingBranch === "") {
        existingBranch =
          availableBranches(
            (loadedRefs?.local ?? []).map((branch) => branch.name),
            loadedWorktrees,
          )[0] ?? "";
      }
      if (!folderEdited) {
        folder = defaultWorktreePath(mainWorktreeRoot(loadedWorktrees, repoRoot), branchName);
      }
    });
  });

  // The default folder follows the branch.
  $effect(() => {
    const next = defaultWorktreePath(mainRoot, branchName);
    untrack(() => {
      if (!folderEdited) {
        folder = next;
      }
    });
  });

  async function browse(): Promise<void> {
    const chosen = await open({ directory: true, multiple: false, title: "Worktree Location", defaultPath: mainRoot });
    if (typeof chosen === "string" && chosen) {
      // The picked folder holds the new worktree folder.
      const folderName = baseName(defaultWorktreePath(mainRoot, branchName));
      folder = joinPath(fromNativePath(chosen).replace(/\/+$/, ""), folderName);
      folderEdited = true;
    }
  }

  function close(): void {
    if (!creating) {
      gitDialogs.close();
    }
  }

  function branchSpec(): WorktreeBranch {
    return mode === "existing"
      ? { kind: "existing", branchName: existingBranch }
      : { kind: "new", branchName: newBranch.trim(), baseRef };
  }

  async function submit(): Promise<void> {
    if (!canCreate) {
      return;
    }
    creating = true;
    createError = null;
    let created: string;
    try {
      created = await api.addWorktree(repoRoot, folder.trim().replace(/\/+$/, ""), branchSpec());
    } catch (error) {
      createError = errorMessage(error);
      creating = false;
      return;
    }
    creating = false;
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const targetRepo = repoRoot;
    const reloadAgents = startAgent;
    gitDialogs.close();
    await repoStore.refreshRepo(targetRepo, true);
    await worktreeStore.load(repoStore.repo?.root ?? null);
    if (reloadAgents) {
      await aiStore.reload();
    }
    if (afterCreate === "open") {
      await repoStore.open(created);
    } else if (afterCreate === "add") {
      await repoStore.addFolder(created);
    } else if (agentChoice === "") {
      toast.success(`Created worktree ${baseName(created)}`, created);
    }
    if (agentChoice !== "") {
      await startAgentIn(agentChoice, created);
    }
  }
</script>

<Dialog
  open
  variant="form"
  title="New Worktree"
  width="medium"
  dismissible={!creating}
  onclose={close}
  onsubmit={() => void submit()}
>
  <RadioGroup
    name="worktree-branch"
    label="Branch"
    direction="row"
    bind:value={mode}
    options={[
      { value: "new", label: "New branch", disabled: creating },
      { value: "existing", label: "Existing branch", disabled: creating || checkoutable.length === 0 },
    ]}
  />

  {#if mode === "new"}
    <Stack direction="row" gap="md">
      <Stack grow>
        <Field label="Branch name" look="compact">
          <Input
            mono
            width="fill"
            bind:value={newBranch}
            disabled={creating}
            spellcheck="false"
            autocomplete="off"
            placeholder="feature/my-change"
            autofocus
          />
        </Field>
      </Stack>
      <Field label="From" look="compact">
        <Select
          label="From"
          width="medium"
          bind:value={baseRef}
          disabled={creating}
          options={baseChoices.map((choice) => ({ value: choice, label: choice }))}
        />
      </Field>
    </Stack>
  {:else}
    <Field label="Branch" look="compact" hint="Branches checked out in another worktree are not listed.">
      <Select
        label="Branch"
        width="fill"
        bind:value={existingBranch}
        disabled={creating}
        options={checkoutable.map((choice) => ({ value: choice, label: choice }))}
      />
    </Field>
  {/if}
  {#if branchError && (mode === "existing" || newBranch !== "")}
    <Text size="small" tone="danger">{branchError}</Text>
  {/if}

  <Field label="Folder" look="compact" error={folderError && folder !== "" ? folderError : null}>
    <Stack direction="row" align="center" gap="md">
      <Input
        mono
        width="fill"
        bind:value={folder}
        oninput={() => (folderEdited = true)}
        disabled={creating}
        spellcheck="false"
        autocomplete="off"
        aria-label="Folder"
      />
      <Button onclick={() => void browse()} disabled={creating}>Browse...</Button>
    </Stack>
  </Field>

  <Checkbox
    checked={afterCreate === "open"}
    onchange={(checked) => (afterCreate = checked ? "open" : "none")}
    disabled={creating}
    label="Open in this window"
  />
  <Checkbox
    checked={afterCreate === "add"}
    onchange={(checked) => (afterCreate = checked ? "add" : "none")}
    disabled={creating || repoStore.workspace === null}
    label="Add to workspace"
  />

  {#if startAgent}
    <Field label="Then start" look="compact">
      <Select
        label="Then start"
        width="fill"
        bind:value={agentChoice}
        disabled={creating}
        options={[
          { value: "", label: "No agent" },
          ...agentPrograms.installed().map((agent) => ({ value: agent.id, label: agent.label })),
        ]}
      />
    </Field>
  {/if}

  {#if creating}
    <Stack direction="row" align="center" gap="md" role="status">
      <Spinner size="small" label="Creating" />
      <Text variant="hint" tone="faint">Creating the worktree...</Text>
    </Stack>
  {/if}
  {#if createError}
    <Text size="small" tone="danger" selectable>{createError}</Text>
  {/if}

  {#snippet actions()}
    <Button onclick={close} disabled={creating}>Cancel</Button>
    <Button variant="primary" disabled={!canCreate} onclick={() => void submit()}>
      {creating ? "Creating..." : "Create"}
    </Button>
  {/snippet}
</Dialog>
