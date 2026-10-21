<!-- The Branches popup: a filter, New Branch and Checkout Tag or Revision, then the
     local and remote branches. A branch opens its submenu (Checkout, Compare, Merge, Update,
     Push...) on click, Enter or Right; Up and Down move through the list. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Dialog from "@nibtree/ui/components/Dialog.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import Icon from "@nibtree/ui/components/Icon.svelte";
  import Input from "@nibtree/ui/components/Input.svelte";
  import List from "@nibtree/ui/components/List.svelte";
  import Row from "@nibtree/ui/components/Row.svelte";
  import SectionTitle from "@nibtree/ui/components/SectionTitle.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import { onMount } from "svelte";
  import { repoStore } from "$lib/stores/repo.svelte";
  import type { Refs } from "$lib/types";
  import { contextMenu } from "$lib/ui/menu.svelte";
  import { checkoutTo, loadDetails } from "../changes/repoActions";
  import { newBranchFrom, repoTarget } from "../sidebar/actions";
  import { branchItemKey, branchListItems, type BranchListItem, filterBranches, trackingHint } from "./branchPopup";
  import { branchMenuItems } from "./branchPopupActions";
  import { gitDialogs } from "./gitDialogs.svelte";

  interface Props {
    repoRoot: string;
  }

  let { repoRoot }: Props = $props();

  let refs = $state.raw<Refs | null>(null);
  let query = $state("");
  let selectedKey = $state<string | null>(null);
  let filterEl = $state<HTMLInputElement | null>(null);

  const status = $derived(repoStore.statuses[repoRoot] ?? null);
  const repoName = $derived(repoStore.repos.find((repo) => repo.root === repoRoot)?.name ?? "repository");
  const items = $derived(branchListItems(filterBranches(refs, query)));
  const context = $derived({
    current: status?.head.branch ?? null,
    busy: repoStore.busy !== null,
    operation: (status?.op.kind ?? "none") !== "none",
    hasRemotes: (refs?.remotes.length ?? 0) > 0,
  });

  onMount(() => {
    void loadDetails(repoRoot).then((details) => {
      refs = details.refs;
    });
  });

  // The active repository's branches stay fresh after an action elsewhere.
  $effect(() => {
    if (repoRoot === repoStore.repo?.root && repoStore.refs) {
      refs = repoStore.refs;
    }
  });

  function close(): void {
    gitDialogs.close();
  }

  function target() {
    return repoTarget(repoRoot, refs);
  }

  /** Opens a branch's submenu beside its row: the clicked one, else the highlighted one. */
  function openSubmenu(item: BranchListItem | undefined, keyboard: boolean, rowEl?: Element | null): void {
    const element = rowEl ?? document.querySelector('[aria-label="Branches"] [aria-selected="true"]');
    if (!item || item.kind === "group" || !element) {
      return;
    }
    selectedKey = branchItemKey(item);
    const rect = element.getBoundingClientRect();
    const anchor = new MouseEvent("contextmenu", { clientX: rect.right - 4, clientY: rect.top });
    contextMenu.open(anchor, branchMenuItems(item, context, target(), repoRoot), { keyboard });
  }

  function onFilterKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowRight" && query === "") {
      event.preventDefault();
      openSubmenu(
        items.find((item) => branchItemKey(item) === selectedKey),
        true,
      );
    }
  }

  function newBranch(): void {
    close();
    void newBranchFrom(null, "", target());
  }

  function checkoutRevision(): void {
    // Read before close(): the props follow gitDialogs.active, which close() clears.
    const revision = target();
    const targetRepo = repoRoot;
    close();
    void checkoutTo(revision, targetRepo);
  }
</script>

<Dialog open variant="form" title="Branches ({repoName})" width="small" onclose={close}>
  <Input
    width="fill"
    bind:element={filterEl}
    bind:value={query}
    onkeydown={onFilterKeydown}
    placeholder="Filter branches"
    spellcheck="false"
    autocomplete="off"
    aria-label="Filter branches"
    autofocus
  />
  <Stack gap="none">
    <Row onclick={newBranch} disabled={context.busy || (status?.head.unborn ?? false)}>
      <Icon name="plus" size="medium" /><Text>New Branch...</Text>
    </Row>
    <Row onclick={checkoutRevision} disabled={context.busy || context.operation}>
      <Icon name="tag" size="medium" /><Text>Checkout Tag or Revision...</Text>
    </Row>
  </Stack>
  <Divider />
  <List
    {items}
    itemKey={branchItemKey}
    label="Branches"
    height="large"
    bind:selected={selectedKey}
    skip={(item) => item.kind === "group"}
    field={filterEl}
    fieldKeys="drive"
    onactivate={(item) => openSubmenu(item, true)}
  >
    {#snippet row(item, state)}
      {#if item.kind === "group"}
        <SectionTitle variant="picker" title={item.label} />
      {:else}
        <Row
          selected={state.selected}
          onhover={() => (selectedKey = branchItemKey(item))}
          onclick={(event) => openSubmenu(item, false, event.currentTarget as Element)}
        >
          {#if item.kind === "local"}
            <Icon name={item.branch.isHead ? "check" : "branch"} size="medium" />
            <Stack grow>
              <Text truncate weight={item.branch.isHead ? "semibold" : undefined}>{item.branch.name}</Text>
            </Stack>
            <Text variant="hint" tone="faint" truncate>{trackingHint(item.branch)}</Text>
          {:else}
            <Icon name="branch" size="medium" />
            <Stack grow><Text truncate>{item.remoteBranch.name}</Text></Stack>
          {/if}
          <Icon name="chevron-right" size="compact" />
        </Row>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Stack padding="md">
        <Text variant="hint" tone="faint">{refs === null ? "Loading..." : "No branches match"}</Text>
      </Stack>
    {/snippet}
  </List>

  {#snippet footnote()}
    <Text variant="hint" tone="faint">Enter or Right opens the branch's actions</Text>
  {/snippet}
  {#snippet actions()}
    <Button onclick={close}>Close</Button>
  {/snippet}
</Dialog>
