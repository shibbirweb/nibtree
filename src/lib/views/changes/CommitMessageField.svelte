<script lang="ts">
  // The commit message: its history (Cmd+E, Up in an empty box), templates, commit.template and the subject note.
  import { tick } from "svelte";
  import { api } from "$lib/api";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { platformFromUserAgent } from "$lib/menu/menuSpec";
  import { repoStore } from "$lib/stores/repo.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { dialogs } from "$lib/ui/dialog.svelte";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import TextArea from "@nibtree/ui/components/TextArea.svelte";
  import { type CommitDraft, commitDraft } from "./commitDraft.svelte";
  import { registerCommitField } from "./commitFields";
  import { historyMenuItems, templateMenuItems } from "./commitMessageMenus";
  import { MAX_MESSAGE_HISTORY, mergeHistory } from "./commitMessages";
  import { expandTemplate, splitGitTemplate, subjectWarning } from "./commitTemplates";

  interface Props {
    repoRoot: string;
    placeholder: string;
    /** The smaller box at the top of a repository's section. */
    compact: boolean;
    /** Cmd+Enter (Ctrl+Enter) in the box. */
    oncommit: () => void;
  }

  let { repoRoot, placeholder, compact, oncommit }: Props = $props();

  let messageEl = $state<HTMLTextAreaElement | null>(null);
  let historyButton = $state<HTMLButtonElement | null>(null);
  // Cmd+E on macOS, where Ctrl+E moves to the end of the line; Ctrl+E elsewhere.
  const onMac = platformFromUserAgent(navigator.userAgent) === "macos";
  const historyKeys = localKeys("CmdOrCtrl+E");

  const draft = $derived(commitDraft.for(repoRoot));

  // So Git > Commit (focusCommitMessage) finds this box.
  $effect(() => {
    if (messageEl) {
      return registerCommitField(repoRoot, messageEl);
    }
  });
  const subjectNote = $derived(settings.commitSubjectGuide ? subjectWarning(draft.message) : null);

  // commit.template fills an empty box once per commit, like git's editor would.
  $effect(() => {
    const target = draft;
    const root = repoRoot;
    if (target.templateChecked || target.amend || target.message !== "") {
      return;
    }
    target.templateChecked = true;
    void loadGitTemplate(root, target);
  });

  async function loadGitTemplate(root: string, target: CommitDraft): Promise<void> {
    const raw = await api.getCommitTemplate(root).catch(() => null);
    if (raw === null) {
      return;
    }
    const { text, comments } = splitGitTemplate(raw);
    target.templateHint = comments === "" ? null : comments;
    if (text !== "" && target.message === "" && !target.amend) {
      target.message = text;
      target.template = text;
    }
  }

  function onInput(event: Event): void {
    const next = (event.currentTarget as HTMLTextAreaElement).value;
    const previous = draft.message;
    // A cleared box keeps its text in the history.
    if (next.trim() === "" && !draft.isBlank()) {
      settings.rememberCommitMessage(repoRoot, previous);
    }
    draft.message = next;
  }

  /** Puts `text` into the box; what was typed goes to the history (or is confirmed away). */
  async function replaceMessage(text: string, cursor: number | null): Promise<void> {
    const target = draft;
    const root = repoRoot;
    if (!target.isBlank() && target.message !== text) {
      if (settings.commitMessageHistory) {
        settings.rememberCommitMessage(root, target.message);
      } else {
        const confirmed = await dialogs.confirm({
          title: "Replace Message",
          message: "Replace the commit message you typed?",
          confirmLabel: "Replace",
          danger: true,
        });
        if (!confirmed) {
          return;
        }
      }
    }
    target.message = text;
    await tick();
    const at = cursor ?? text.length;
    messageEl?.focus();
    messageEl?.setSelectionRange(at, at);
  }

  async function openHistory(anchor: HTMLElement, keyboard: boolean): Promise<void> {
    const root = repoRoot;
    const saved = settings.commitMessages[root] ?? [];
    const fromLog = await api.recentCommitMessages(root, MAX_MESSAGE_HISTORY).catch(() => []);
    const entries = mergeHistory(saved, fromLog);
    const items = historyMenuItems(entries, Date.now(), (message) => void replaceMessage(message, null));
    contextMenu.openBelow(anchor, items, { keyboard, alignEnd: true });
  }

  async function applyTemplate(text: string): Promise<void> {
    const root = repoRoot;
    let userName: string | null = null;
    if (text.includes("{user}")) {
      const identity = await api.getIdentity(root).catch(() => null);
      userName = identity?.local.name ?? identity?.global.name ?? null;
    }
    const branchName = repoStore.statuses[root]?.head?.branch ?? null;
    const expanded = expandTemplate(text, { branch: branchName, userName, date: new Date() });
    await replaceMessage(expanded.text, expanded.cursor);
  }

  async function openTemplates(event: MouseEvent): Promise<void> {
    const anchor = event.currentTarget as HTMLElement;
    const keyboard = event.detail === 0;
    const raw = await api.getCommitTemplate(repoRoot).catch(() => null);
    const gitTemplate = raw === null ? null : splitGitTemplate(raw).text;
    const items = templateMenuItems(settings.commitTemplates, gitTemplate, {
      onTemplate: (text) => void applyTemplate(text),
      onGitTemplate: (text) => void replaceMessage(text, null),
      onEdit: () => settings.openDialog("merge"),
    });
    contextMenu.openBelow(anchor, items, { keyboard, alignEnd: true });
  }

  function onKeydown(event: KeyboardEvent): void {
    const command = event.metaKey || event.ctrlKey;
    if (event.key === "Enter" && command) {
      event.preventDefault();
      oncommit();
      return;
    }
    if (!settings.commitMessageHistory || event.altKey || event.shiftKey) {
      return;
    }
    // Cmd+E, or Up in an empty box like a shell: the message history.
    const historyModifier = onMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const historyKey =
      (historyModifier && event.code === "KeyE") || (!command && event.key === "ArrowUp" && draft.message === "");
    if (historyKey) {
      event.preventDefault();
      const anchor = historyButton ?? messageEl;
      if (anchor) {
        void openHistory(anchor, true);
      }
    }
  }
</script>

<TextArea
  bind:element={messageEl}
  height={compact ? "short" : "tall"}
  {placeholder}
  value={draft.message}
  oninput={onInput}
  onkeydown={onKeydown}
  spellcheck="true"
  aria-label="Commit message"
>
  {#snippet tools()}
    {#if settings.commitMessageHistory}
      <IconButton
        bind:element={historyButton}
        icon="history"
        iconSize="medium"
        size="small"
        tone="dim"
        onclick={(event) => void openHistory(event.currentTarget, event.detail === 0)}
        title="Message History ({historyKeys})"
        label="Message History"
        aria-haspopup="menu"
      />
    {/if}
    <IconButton
      icon="file"
      iconSize="medium"
      size="small"
      tone="dim"
      onclick={(event) => void openTemplates(event)}
      title="Message Templates"
      label="Message Templates"
      aria-haspopup="menu"
    />
  {/snippet}
</TextArea>
{#if subjectNote}
  <Stack role="status">
    <Text size="small" tone="warning">{subjectNote}</Text>
  </Stack>
{/if}
