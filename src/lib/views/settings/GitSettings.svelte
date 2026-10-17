<!-- Settings > Git: diffs, the log, fetching, commit signing, the Git Console, identity and commit messages. -->
<script lang="ts">
  import { localKeys } from "$lib/commands/commandRuntime";
  import { AUTO_FETCH_INTERVAL_RANGE } from "$lib/stores/autoFetchPlan";
  import { repoStore } from "$lib/stores/repo.svelte";
  import {
    COMMIT_BOX_LAYOUT_CHOICES,
    defaultPreferences,
    DIFF_LAYOUT_CHOICES,
    DIFF_PANES_CHOICES,
    MERGE_LAYOUT_CHOICES,
    settings,
  } from "$lib/stores/settings.svelte";
  import { terminalStore } from "$lib/terminal/terminalStore.svelte";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import Button from "@nibtree/ui/components/Button.svelte";
  import Segmented from "@nibtree/ui/components/Segmented.svelte";
  import Select from "@nibtree/ui/components/Select.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Switch from "@nibtree/ui/components/Switch.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { GPG_SIGN_CHOICES } from "../changes/commitOptions";
  import CommitTemplateSettings from "./CommitTemplateSettings.svelte";
  import GitIdentitySettings from "./GitIdentitySettings.svelte";
  import NumberSetting from "./NumberSetting.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import SettingsRow from "./SettingsRow.svelte";
  import { set } from "./settingsShared";

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  function applyAutoFetchInterval(typed: number | null): void {
    const [min, max] = AUTO_FETCH_INTERVAL_RANGE;
    const minutes =
      typed === null ? settings.autoFetchIntervalMinutes : Math.min(max, Math.max(min, Math.round(typed)));
    if (minutes !== settings.autoFetchIntervalMinutes) {
      set("autoFetchIntervalMinutes", minutes);
    }
  }

  function showGitConsole(): void {
    onclose();
    terminalStore.showTab("gitConsole");
  }

  async function clearMessageHistory(): Promise<void> {
    const confirmed = await dialogs.confirm({
      title: "Clear Saved Messages",
      message: "Forget the saved commit messages of every repository? Messages of your commits stay in the history.",
      confirmLabel: "Clear",
      danger: true,
    });
    if (confirmed) {
      settings.clearCommitMessages();
    }
  }
</script>

<SettingsRow title="Diff layout">
  {#snippet hintContent()}
    Show every diff side by side, or inline in one column with removed lines above the lines that replace them. The
    layout buttons in the diff toolbar change these settings too.
  {/snippet}
  <Segmented
    label="Diff layout"
    options={DIFF_LAYOUT_CHOICES}
    value={settings.diffLayout}
    onchange={(layout) => set("diffLayout", layout)}
  />
</SettingsRow>
<SettingsRow title="Side by side in Changes" nested>
  {#snippet hintContent()}
    2 columns show HEAD and your file. 3 columns put the staged version between them, so you can stage or unstage
    changes from either side.
  {/snippet}
  <Segmented
    label="Side by side in Changes"
    options={DIFF_PANES_CHOICES}
    value={settings.changesDiffPanes}
    onchange={(panes) => set("changesDiffPanes", panes)}
  />
</SettingsRow>
<SettingsRow title="Side by side for commits" nested>
  {#snippet hintContent()}
    2 columns show the parent and the commit. 3 columns add your working tree, so you can revert or apply a change
    there; a file changed on both sides of a merge shows parent 1, the result and parent 2.
  {/snippet}
  <Segmented
    label="Side by side for commits"
    options={DIFF_PANES_CHOICES}
    value={settings.mergeDiffPanes}
    onchange={(panes) => set("mergeDiffPanes", panes)}
  />
</SettingsRow>
<SettingsRow title="Merge tool layout">
  {#snippet hintContent()}
    Columns shows yours, the result and theirs side by side. Stacked shows yours and theirs on top and the result below.
    The buttons in the merge tool's toolbar switch it too.
  {/snippet}
  <Segmented
    label="Merge tool layout"
    options={MERGE_LAYOUT_CHOICES}
    value={settings.mergeLayout}
    onchange={(layout) => set("mergeLayout", layout)}
  />
</SettingsRow>
<SettingsRow title="Ignore whitespace in the merge tool" toggle>
  {#snippet hintContent()}
    Start merges with whitespace-only differences hidden. The Ignore whitespace button in the merge tool changes this
    setting too.
  {/snippet}
  <Switch
    label="Ignore whitespace in the merge tool"
    checked={settings.ignoreWhitespace}
    onchange={(on) => set("ignoreWhitespace", on)}
  />
</SettingsRow>
<SettingsRow
  title="Show all branches in the log"
  toggle
  hint={"Include every local and remote branch, like `git log --branches --remotes`. Tags and stashes are " +
    "not followed."}
>
  <Switch label="Show all branches in the log" checked={settings.logAllRefs} onchange={(on) => set("logAllRefs", on)} />
</SettingsRow>
<SettingsRow title="Auto fetch" toggle>
  {#snippet hintContent()}
    Fetch every remote in the background while the window is in use, one repository at a time. It never asks for a
    password; a failed fetch waits longer and shows a note in the status bar.
  {/snippet}
  <Switch label="Auto fetch" checked={settings.autoFetch} onchange={(on) => set("autoFetch", on)} />
</SettingsRow>
{#if settings.autoFetch}
  <SettingsRow title="Fetch every" nested>
    {#snippet hintContent()}
      Minutes, from {AUTO_FETCH_INTERVAL_RANGE[0]} to {AUTO_FETCH_INTERVAL_RANGE[1]}. The default is
      {defaultPreferences.autoFetchIntervalMinutes}.
    {/snippet}
    <NumberSetting
      label="Auto fetch interval in minutes"
      value={settings.autoFetchIntervalMinutes}
      min={AUTO_FETCH_INTERVAL_RANGE[0]}
      max={AUTO_FETCH_INTERVAL_RANGE[1]}
      onapply={applyAutoFetchInterval}
    />
  </SettingsRow>
{/if}
<SettingsRow
  title="Sign off commits"
  toggle
  hint={"Add a Signed-off-by trailer to every commit (`--signoff`). Also in Commit Options."}
>
  <Switch label="Sign off commits" checked={settings.commitSignOff} onchange={(on) => set("commitSignOff", on)} />
</SettingsRow>
<SettingsRow
  title="GPG sign commits"
  hint={"Default follows `commit.gpgSign`; Sign adds `-S`, Do not sign adds `--no-gpg-sign`."}
>
  <Select
    label="GPG sign commits"
    options={GPG_SIGN_CHOICES}
    value={settings.commitGpgSign}
    onchange={(sign) => set("commitGpgSign", sign)}
  />
</SettingsRow>
<SettingsRow title="Git Console" toggle>
  {#snippet hintContent()}
    Keep a list of the git commands the app runs, with their output. It shows as the Git Console tab in the bottom
    panel, next to Terminal (View &gt; Git Console). Off, nothing is recorded or loaded.
    {#if settings.gitConsole && repoStore.workspace}
      <Stack element="span" paddingY="xs">
        <Button size="small" onclick={showGitConsole}>Show Git Console</Button>
      </Stack>
    {/if}
  {/snippet}
  <Switch label="Git Console" checked={settings.gitConsole} onchange={(on) => set("gitConsole", on)} />
</SettingsRow>
<SettingsGroup title="Commit identity">
  <SettingsRow
    title="Name and email"
    stacked
    hint={"Written into every commit (`user.name` and `user.email`). A repository's own values win over " +
      "the global ones; leave a field empty to remove it."}
  >
    <GitIdentitySettings />
  </SettingsRow>
</SettingsGroup>
<SettingsGroup title="Commit messages">
  <SettingsRow title="Commit box">
    {#snippet hintContent()}
      Single puts one commit box under the Changes list, with a picker for the repository. Per repository puts a commit
      box at the top of each repository. The button in the Changes title bar changes this setting too.
    {/snippet}
    <Segmented
      label="Commit box"
      options={COMMIT_BOX_LAYOUT_CHOICES}
      value={settings.commitBoxLayout}
      onchange={(layout) => set("commitBoxLayout", layout)}
    />
  </SettingsRow>
  <SettingsRow title="Message history" toggle>
    {#snippet hintContent()}
      The clock in the commit box ({localKeys("CmdOrCtrl+E")}, or Up in an empty box) lists your recent commit messages
      and messages that were not committed. They are kept in state.json, up to 30 per repository.
      {#if settings.commitMessageHistory && Object.keys(settings.commitMessages).length > 0}
        <Stack element="span" paddingY="xs">
          <Button size="small" onclick={() => void clearMessageHistory()}>Clear Saved Messages</Button>
        </Stack>
      {/if}
    {/snippet}
    <Switch
      label="Message history"
      checked={settings.commitMessageHistory}
      onchange={(on) => set("commitMessageHistory", on)}
    />
  </SettingsRow>
  <SettingsRow
    title="Subject line guide"
    hint="A note under the commit box when the first line is longer than 72 characters."
    toggle
  >
    <Switch
      label="Subject line guide"
      checked={settings.commitSubjectGuide}
      onchange={(on) => set("commitSubjectGuide", on)}
    />
  </SettingsRow>
  <SettingsRow
    title="Templates"
    stacked
    hint={"Picked from the page icon in the commit box. A `commit.template` set in git config also fills " +
      "an empty commit box."}
  >
    <CommitTemplateSettings />
  </SettingsRow>
</SettingsGroup>
