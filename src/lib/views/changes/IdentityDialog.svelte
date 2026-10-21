<!-- Asked before a commit in a repository where git has no name and email: saves them for
     every repository (git config --global) or only this one, then the commit goes ahead. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Field from "@nibtree/ui/components/Field.svelte";
  import Fieldset from "@nibtree/ui/components/Fieldset.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import RadioGroup from "@nibtree/ui/components/RadioGroup.svelte";
  import Spinner from "@nibtree/ui/components/Spinner.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { onDestroy, untrack } from "svelte";
  import { api, errorMessage } from "$lib/api";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { Identity, IdentityScope } from "$lib/types";
  import { gitDialogs } from "../git/gitDialogs.svelte";
  import { identityPrefill, validateIdentityEmail, validateIdentityName } from "./identity";

  interface Props {
    repoRoot: string;
    identity: Identity;
    resolve: (saved: boolean) => void;
  }

  let { repoRoot, identity, resolve }: Props = $props();

  const start = untrack(() => identityPrefill(identity));
  let name = $state(start.name);
  let email = $state(start.email);
  let scope = $state<IdentityScope>(start.scope);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let touched = $state(false);
  let answered = false;

  const repoName = $derived(repoStore.repos.find((repo) => repo.root === repoRoot)?.name ?? "this repository");
  const nameError = $derived(validateIdentityName(name, true));
  const emailError = $derived(validateIdentityEmail(email, true));
  const canSave = $derived(nameError === null && emailError === null && !saving);

  function answer(saved: boolean): void {
    if (!answered) {
      answered = true;
      resolve(saved);
    }
  }

  // Closed any other way (another dialog took its place): no commit.
  onDestroy(() => answer(false));

  /** Stays open while saving: the commit waiting on it continues once the save is done. */
  function cancel(): boolean {
    if (saving) {
      return false;
    }
    gitDialogs.close();
    return true;
  }

  async function save(): Promise<void> {
    touched = true;
    if (!canSave) {
      return;
    }
    saving = true;
    saveError = null;
    try {
      const saved = await api.setIdentity(repoRoot, scope, name, email);
      if (!saved.complete) {
        saveError = "git still has no name and email here; check your git config";
        return;
      }
      answer(true);
      gitDialogs.close();
    } catch (error) {
      saveError = errorMessage(error);
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  open
  variant="form"
  title="Who is committing?"
  width="small"
  dismissible={!saving}
  onclose={cancel}
  onsubmit={() => void save()}
>
  <Text variant="hint" tone="faint">
    git needs a name and email for each commit. They are saved in your git config.
  </Text>
  <Field label="Name" look="compact" error={touched && nameError ? nameError : null}>
    <Input width="fill" bind:value={name} placeholder="Ann Lee" autocomplete="off" spellcheck="false" />
  </Field>
  <Field label="Email" look="compact" error={touched && emailError ? emailError : null}>
    <Input
      width="fill"
      type="email"
      bind:value={email}
      placeholder="ann@example.com"
      autocomplete="off"
      spellcheck="false"
    />
  </Field>
  <Fieldset legend="Use for">
    <RadioGroup
      name="identity-scope"
      label="Use for"
      bind:value={scope}
      options={[
        { value: "global", label: "All repositories (--global)" },
        { value: "local", label: `Only ${repoName}` },
      ]}
    />
  </Fieldset>
  {#if saveError}
    <Text size="small" tone="danger" selectable>{saveError}</Text>
  {/if}

  {#snippet actions()}
    {#if saving}<Spinner size="small" label="Saving" />{/if}
    <Button onclick={cancel} disabled={saving}>Cancel</Button>
    <Button variant="primary" onclick={() => void save()} disabled={saving || (touched && !canSave)}>
      Save and Commit
    </Button>
  {/snippet}
</Dialog>
