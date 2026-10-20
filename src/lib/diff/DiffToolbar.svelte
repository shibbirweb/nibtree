<!-- The bar over every diff, two panes, aligned, inline or three panes: change arrows and count, the layout, Collapse
     unchanged, Blame, Open File, the line actions of the Changes diff, and the file's name at the end. One bar for all
     of them, so a fix or a new button reaches every diff; each view says what it offers. -->
<script lang="ts">
  import Button from "@nibtree/ui/components/Button.svelte";
  import Divider from "@nibtree/ui/components/Divider.svelte";
  import IconButton from "@nibtree/ui/components/IconButton.svelte";
  import Stack from "@nibtree/ui/components/Stack.svelte";
  import Text from "@nibtree/ui/components/Text.svelte";
  import ToggleButton from "@nibtree/ui/components/ToggleButton.svelte";
  import Toolbar from "@nibtree/ui/components/Toolbar.svelte";
  import { localKeys } from "$lib/commands/commandRuntime";
  import { settings } from "$lib/stores/settings.svelte";
  import type { LineAction } from "$lib/types";
  import { lineTitle } from "./diffLineMenu";
  import { changeCounter } from "./diffToolbar";
  import { diffPrefs } from "./prefs.svelte";

  export type ToolbarLayout = "three" | "sideBySide" | "aligned" | "inline";

  interface Props {
    /** The changes to step through, and the one picked (-1 for none). */
    changeCount: number;
    current: number;
    /** What the counter says before a change is picked, such as "4 changes, 1 conflict"; null counts the changes. */
    summary?: string | null;
    ongo: (direction: 1 | -1) => void;
    /** A text diff with changes: the arrows, layout and collapse work. */
    textDiff: boolean;
    layout: ToolbarLayout;
    /** The Three panes button's tooltip, or null when this file has no three-pane view. */
    threePanes?: string | null;
    onlayout: (layout: ToolbarLayout) => void;
    collapseTitle?: string;
    showBlame: boolean;
    showOpenFile: boolean;
    onopenfile: () => void;
    lineMode?: "unstaged" | "staged" | null;
    selectedLines?: number;
    onlines?: (action: LineAction) => void;
    path: string;
  }

  let {
    changeCount,
    current,
    summary = null,
    ongo,
    textDiff,
    layout,
    threePanes = null,
    onlayout,
    collapseTitle = "Collapse unchanged fragments",
    showBlame,
    showOpenFile,
    onopenfile,
    lineMode = null,
    selectedLines = 0,
    onlines,
    path,
  }: Props = $props();

  const fileName = $derived(path.split("/").pop() ?? path);
  const directory = $derived(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const noChunks = $derived(!textDiff || changeCount === 0);
  const counterLabel = $derived(changeCounter(changeCount, current, summary));
</script>

<Toolbar variant="editor" label="Diff" responsive>
  <IconButton
    icon="arrow-up"
    iconSize="normal"
    size="compact"
    label="Previous change"
    title="Previous change ({localKeys('Shift+F7')})"
    disabled={noChunks}
    onclick={() => ongo(-1)}
  />
  <IconButton
    icon="arrow-down"
    iconSize="normal"
    size="compact"
    label="Next change"
    title="Next change ({localKeys('F7')})"
    disabled={noChunks}
    onclick={() => ongo(1)}
  />
  {#if textDiff}
    <Text tone="dim" size="small" tabular truncate>{counterLabel}</Text>
  {/if}
  <Divider direction="vertical" />
  <Stack direction="row" gap="none" role="group" label="Diff layout">
    {#if threePanes}
      <ToggleButton
        icon="split-three"
        label="Three panes"
        title={threePanes}
        bind:pressed={() => layout === "three", (on) => on && onlayout("three")}
      />
    {/if}
    <ToggleButton
      icon="split-view"
      label="Side by side"
      title="Side by side: old text on the left, new on the right"
      disabled={!textDiff}
      bind:pressed={() => layout === "sideBySide", (on) => on && onlayout("sideBySide")}
    />
    <ToggleButton
      icon="split-aligned"
      label="Aligned"
      title="Aligned: old and new side by side, line for line, scrolling as one"
      disabled={!textDiff}
      bind:pressed={() => layout === "aligned", (on) => on && onlayout("aligned")}
    />
    <ToggleButton
      icon="split-rows"
      label="Inline"
      title="Inline: removed lines above the lines that replace them"
      disabled={!textDiff}
      bind:pressed={() => layout === "inline", (on) => on && onlayout("inline")}
    />
  </Stack>
  <ToggleButton
    icon="list-tree"
    text="Collapse unchanged"
    label="Collapse unchanged"
    title={collapseTitle}
    disabled={!textDiff}
    bind:pressed={() => diffPrefs.collapseUnchanged, () => diffPrefs.toggleCollapse()}
  />
  {#if showBlame && textDiff}
    <ToggleButton
      icon="history"
      text="Blame"
      label="Blame"
      title="Show who changed each line and when (git blame)"
      bind:pressed={() => settings.blameGutter, (on) => settings.setPreference("blameGutter", on)}
    />
  {/if}
  {#if showOpenFile}
    <Button
      variant="ghost"
      size="small"
      icon="external-link"
      title="Open the file itself in an editor tab"
      onclick={onopenfile}
    >
      Open File
    </Button>
  {/if}
  {#if lineMode}
    <Divider direction="vertical" />
    {#if lineMode === "unstaged"}
      <Button
        variant="ghost"
        size="small"
        icon="plus"
        disabled={selectedLines === 0}
        title={lineTitle("Stage the selected lines, or the change at the cursor", "stage")}
        onclick={() => onlines?.("stage")}
      >
        Stage Lines
      </Button>
      <Button
        variant="ghost"
        size="small"
        icon="discard"
        disabled={selectedLines === 0}
        title={lineTitle("Discard the selected lines in the work tree", "discard")}
        onclick={() => onlines?.("discard")}
      >
        Discard Lines
      </Button>
    {:else}
      <Button
        variant="ghost"
        size="small"
        icon="minus"
        disabled={selectedLines === 0}
        title={lineTitle("Unstage the selected lines, or the change at the cursor", "unstage")}
        onclick={() => onlines?.("unstage")}
      >
        Unstage Lines
      </Button>
    {/if}
  {/if}
  {#snippet end()}
    <Stack direction="row" gap="sm" shrink="first" align="baseline">
      <Text truncate giveWay size="small" weight="semibold" title={path}>{fileName}</Text>
      {#if directory}
        <Text truncate giveWay tone="dim" size="small" hideAt="compact">{directory}</Text>
      {/if}
    </Stack>
  {/snippet}
</Toolbar>
