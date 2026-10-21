<!-- Git Remotes: each remote with its fetch and push URLs; add, edit (name and
     URLs) and remove, with the names checked like git does. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import ListBox from "@nibtree/ui/components/ListBox.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { onMount } from "svelte";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { RemoteInfo } from "$lib/types";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { gitDialogs } from "./gitDialogs.svelte";
  import { validateRemoteName, validateRemoteUrl } from "./gitOptions";

  interface Props {
    repoRoot: string;
  }

  let { repoRoot }: Props = $props();

  let remotes = $state.raw<RemoteInfo[]>([]);
  let loadError = $state<string | null>(null);
  /** The remote being added (original null) or edited. */
  let editing = $state<{ original: string | null; name: string; fetchUrl: string; pushUrl: string } | null>(null);
  let working = $state(false);
  let nameEl = $state<HTMLInputElement | null>(null);

  const names = $derived(remotes.map((remote) => remote.name));
  const nameError = $derived(editing ? validateRemoteName(editing.name, names, editing.original) : null);
  const fetchError = $derived(editing ? validateRemoteUrl(editing.fetchUrl) : null);
  const pushError = $derived(editing ? validateRemoteUrl(editing.pushUrl, true) : null);
  const canSave = $derived(editing !== null && !nameError && !fetchError && !pushError && !working);

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    try {
      remotes = await api.listRemotes(repoRoot);
      loadError = null;
    } catch (error) {
      loadError = errorMessage(error);
    }
  }

  async function startEdit(remote: RemoteInfo | null): Promise<void> {
    const fetchUrl = remote?.fetchUrl ?? "";
    const pushUrl = remote && remote.pushUrl && remote.pushUrl !== fetchUrl ? remote.pushUrl : "";
    editing = {
      original: remote?.name ?? null,
      name: remote?.name ?? (names.includes("origin") ? "" : "origin"),
      fetchUrl,
      pushUrl,
    };
    // The form replaces the list; put the caret in its first field.
    await Promise.resolve();
    nameEl?.focus();
    nameEl?.select();
  }

  async function save(): Promise<void> {
    const form = editing;
    if (!form || !canSave) {
      return;
    }
    working = true;
    const name = form.name.trim();
    const fetchUrl = form.fetchUrl.trim();
    const pushUrl = form.pushUrl.trim() === "" ? null : form.pushUrl.trim();
    const original = form.original;
    const done = await repoStore.run(
      original ? "Edit remote" : "Add remote",
      async (repoPath) => {
        if (original) {
          await api.editRemote(repoPath, original, name, fetchUrl, pushUrl);
        } else {
          await api.addRemote(repoPath, name, fetchUrl, pushUrl);
        }
        return true;
      },
      { repoPath: repoRoot, success: original ? `Saved ${name}` : `Added ${name}` },
    );
    working = false;
    if (done) {
      editing = null;
    }
    await load();
  }

  async function remove(remote: RemoteInfo): Promise<void> {
    const confirmed = await dialogs.confirm({
      title: "Remove Remote",
      message:
        `Remove the remote '${remote.name}'? Its remote-tracking branches go too; the repository on the server ` +
        "is not touched.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    await repoStore.run("Remove remote", (repoPath) => api.removeRemote(repoPath, remote.name), {
      repoPath: repoRoot,
      success: `Removed ${remote.name}`,
    });
    await load();
  }

  /** Esc in the form goes back to the list and keeps the dialog open. */
  function close(): boolean {
    if (editing) {
      editing = null;
      return false;
    }
    gitDialogs.close();
    return true;
  }
</script>

<Dialog
  open
  variant="form"
  title="Git Remotes"
  width="large"
  onclose={close}
  onsubmit={editing ? () => void save() : undefined}
>
  {#if editing}
    <Field label="Name" look="compact" error={nameError && editing.name !== "" ? nameError : null}>
      <Input
        width="fill"
        bind:element={nameEl}
        bind:value={editing.name}
        spellcheck="false"
        autocomplete="off"
        placeholder="origin"
      />
    </Field>
    <Field label="URL" look="compact" error={fetchError && editing.fetchUrl !== "" ? fetchError : null}>
      <Input
        mono
        width="fill"
        bind:value={editing.fetchUrl}
        spellcheck="false"
        autocomplete="off"
        placeholder="git@github.com:owner/repo.git"
      />
    </Field>
    <Field label="Push URL (optional: empty pushes to the URL above)" look="compact" error={pushError || null}>
      <Input mono width="fill" bind:value={editing.pushUrl} spellcheck="false" autocomplete="off" />
    </Field>
  {:else if loadError}
    <Text size="small" tone="danger">{loadError}</Text>
  {:else if remotes.length === 0}
    <Text tone="dim">This repository has no remotes.</Text>
  {:else}
    <ListBox label="Remotes">
      {#each remotes as remote (remote.name)}
        <Row size="large" line actionsShown="always" label={remote.name}>
          <Stack gap="xxs" grow>
            <Text weight="semibold">{remote.name}</Text>
            <Text mono size="compact" tone="dim" selectable truncate title={remote.fetchUrl ?? ""}>
              {remote.fetchUrl ?? "(no URL)"}
            </Text>
            {#if remote.pushUrl && remote.pushUrl !== remote.fetchUrl}
              <Text mono size="compact" tone="dim" selectable truncate title={remote.pushUrl}>
                <Text variant="hint">push</Text>
                {remote.pushUrl}
              </Text>
            {/if}
          </Stack>
          {#snippet actions()}
            <Button size="small" onclick={() => void startEdit(remote)}>Edit</Button>
            <Button size="small" variant="danger" onclick={() => void remove(remote)}>Remove</Button>
          {/snippet}
        </Row>
      {/each}
    </ListBox>
  {/if}

  {#snippet footnote()}
    {#if !editing}
      <Button onclick={() => void startEdit(null)} autofocus>Add Remote...</Button>
    {/if}
  {/snippet}
  {#snippet actions()}
    {#if editing}
      <Button onclick={() => (editing = null)}>Back</Button>
      <Button variant="primary" disabled={!canSave} onclick={() => void save()}>
        {editing.original ? "Save" : "Add"}
      </Button>
    {:else}
      <Button variant="primary" onclick={close}>Done</Button>
    {/if}
  {/snippet}
</Dialog>
