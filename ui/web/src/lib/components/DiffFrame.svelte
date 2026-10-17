<!-- The frame of a diff whose editors the caller builds: the sides' names, a find bar slot over each side (shown
     only while a bar is open, so it never scrolls away with the text), the body the editors go into and the handle
     between the sides. Labels, find bars and editors share `ratio`, so they stay lined up. With `ribbons` (side by
     side), each side scrolls itself and a MergeConnector between them joins every change's lines, with the apply
     arrow on it when `onapply` is set and a revert button when `onrevert` is (without them the gap is narrow, as
     when the sides draw the buttons in their gutters); `ruler` leaves room for a change overview at the right. -->
<script module lang="ts">
  export interface DiffFrameParts {
    /** Where the editors go: a MergeView or one EditorView. The connector's ribbons are measured from its top. */
    body: HTMLDivElement;
    /** Containers for each side's search panel (CodeMirror `panels({ topContainer })`). */
    findOriginal: HTMLDivElement;
    findModified: HTMLDivElement;
  }
</script>

<script lang="ts">
  import { componentTokens } from "../styles/tokens";
  import Icon from "./Icon.svelte";
  import MergeConnector, { type ConnectorColors, type ConnectorRibbon } from "./MergeConnector.svelte";
  import SplitHandle from "./SplitHandle.svelte";

  interface Props {
    layout?: "split" | "inline";
    label: string;
    sideLabels?: { original: string; modified: string } | null;
    ribbons?: ConnectorRibbon[] | null;
    applySide?: "left" | "right";
    onapply?: (index: number) => void;
    applyTitle?: string | null;
    onrevert?: (index: number) => void;
    revertTitle?: string | null;
    /** The ribbons: by kind of change, or red to green from the old side to the new. */
    colors?: ConnectorColors;
    ruler?: boolean;
    ratio?: number;
    oncommitratio?: (ratio: number) => void;
    onready?: (parts: DiffFrameParts) => void | (() => void);
    oncontextmenu?: (event: MouseEvent) => void;
  }

  let {
    layout = "split",
    label,
    sideLabels = null,
    ribbons = null,
    applySide = "left",
    onapply,
    applyTitle = null,
    onrevert,
    revertTitle = null,
    colors = "kinds",
    ruler = false,
    ratio = $bindable(0.5),
    oncommitratio,
    onready,
    oncontextmenu,
  }: Props = $props();

  let body = $state<HTMLDivElement | null>(null);
  let findOriginal = $state<HTMLDivElement | null>(null);
  let findModified = $state<HTMLDivElement | null>(null);
  const connected = $derived(layout === "split" && ribbons !== null);
  // The editors stop short of the ruler, so the gap's place leaves it out too.
  // With no buttons on the connector (the app puts them in the sides' gutters) the gap is narrow.
  const buttons = $derived(Boolean(onapply || onrevert));
  const gap = $derived(buttons ? componentTokens.mergeView.gap : componentTokens.mergeView.ribbonGap);
  const gutter = $derived(connected ? gap + (ruler ? componentTokens.diffFrame.ruler : 0) : 0);

  // The parts stay the same across layouts, so switching layout never hands out new elements.
  $effect(() => {
    if (body && findOriginal && findModified && onready) {
      return onready({ body, findOriginal, findModified }) ?? undefined;
    }
  });
</script>

<div
  class="frame"
  role="region"
  aria-label={label}
  style:--diff-left={ratio}
  style:--diff-right={1 - ratio}
  style:--diff-gap={buttons ? "var(--merge-view-gap)" : "var(--merge-view-ribbon-gap)"}
>
  {#if sideLabels}
    <div class="labels" class:connected>
      {#if layout === "inline"}
        <span class="label joined" title="{sideLabels.original} to {sideLabels.modified}">
          <span class="name">{sideLabels.original}</span>
          <Icon name="arrow-right" size="small" />
          <span class="name">{sideLabels.modified}</span>
        </span>
      {:else}
        <span class="label name" title={sideLabels.original}>{sideLabels.original}</span>
        <span class="gap"></span>
        <span class="label name" title={sideLabels.modified}>{sideLabels.modified}</span>
      {/if}
    </div>
  {/if}
  <div class="find-bars" class:connected class:inline={layout === "inline"}>
    <div class="find-host" bind:this={findOriginal}></div>
    <span class="gap"></span>
    <div class="find-host" bind:this={findModified}></div>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="body" class:ruler class:connected bind:this={body} {oncontextmenu}>
    {#if connected && ribbons}
      <div class="connector" style:left="calc((100% - {gutter}px) * {ratio})">
        <MergeConnector {ribbons} side={applySide} {onapply} {applyTitle} {onrevert} {revertTitle} {colors} />
      </div>
    {/if}
    {#if layout === "split"}
      <SplitHandle bind:ratio {gutter} label="Resize the two sides of the diff" oncommit={oncommitratio} />
    {/if}
  </div>
</div>

<style>
  .frame {
    flex: 1;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    width: 100%;
    background: var(--editor-bg);
  }

  .labels {
    flex: none;
    display: flex;
    align-items: center;
    height: var(--diff-labels-height);
    border-bottom: 1px solid var(--border);
    background: var(--panel-alt);
    color: var(--text-dim);
    font-size: var(--font-size-compact);
  }

  .label {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 var(--diff-labels-padding-x);
  }

  .joined {
    display: flex;
    align-items: center;
    gap: var(--diff-labels-gap);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gap {
    flex: none;
    width: 1px;
    align-self: stretch;
    background: var(--border-strong);
  }

  .connected .gap {
    width: var(--diff-gap);
    background: transparent;
  }

  .labels.connected .gap {
    border-left: 1px solid var(--border-strong);
    border-right: 1px solid var(--border-strong);
  }

  /* The labels, find bars and editors share the split. */
  .label:first-child,
  .find-host:first-child,
  .body :global(.cm-mergeViewEditor:first-child) {
    flex-grow: var(--diff-left, 1);
  }

  .label:last-child,
  .find-host:last-child,
  .body :global(.cm-mergeViewEditor:last-child) {
    flex-grow: var(--diff-right, 1);
  }

  /* Shown only while a side's find bar is open; inline has one bar, over the whole width. */
  .find-bars {
    flex: none;
    display: flex;
    background: var(--panel);
  }

  .find-bars:not(:has(:global(.cm-panels))) {
    display: none;
  }

  .find-bars.inline .find-host:first-child,
  .find-bars.inline .gap {
    display: none;
  }

  .find-host {
    flex: 1 1 0;
    min-width: 0;
    border-bottom: 1px solid var(--border-strong);
  }

  .find-host:empty {
    border-bottom-color: transparent;
  }

  .find-host :global(.cm-find-bar) {
    border-bottom: none;
  }

  .find-bars .gap {
    border-bottom: 1px solid var(--border-strong);
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .body :global(.cm-mergeView) {
    position: absolute;
    inset: 0;
    overflow-y: auto;
  }

  /* One editor (inline) scrolls itself; with a ruler it stops short of it, so the ruler never covers its
     scrollbar. CodeMirror's base theme forces position: relative, which ignores `right`. */
  .body > :global(.cm-editor) {
    position: absolute !important;
    inset: 0;
  }

  .ruler > :global(.cm-editor) {
    right: var(--diff-frame-ruler);
  }

  .body :global(.cm-mergeViewEditor + .cm-mergeViewEditor) {
    border-left: 1px solid var(--border-strong);
  }

  /* Connected: each side scrolls itself (the app keeps them in step), with the connector in the gap. */
  .connected :global(.cm-mergeView) {
    overflow: hidden;
  }

  .connected :global(.cm-mergeViewEditors) {
    height: 100%;
    gap: var(--diff-gap);
  }

  .connected :global(.cm-mergeViewEditor) {
    min-width: 0;
  }

  .connected :global(.cm-mergeView .cm-editor),
  .connected :global(.cm-mergeView .cm-editor .cm-scroller) {
    height: 100% !important;
  }

  .connected :global(.cm-mergeView .cm-editor .cm-scroller) {
    overflow-y: auto !important;
  }

  .connected :global(.cm-mergeViewEditor + .cm-mergeViewEditor) {
    border-left: none;
  }

  .connector {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    border-left: 1px solid var(--border-strong);
    border-right: 1px solid var(--border-strong);
  }

  .ruler .connector ~ :global(.cm-mergeView) {
    right: var(--diff-frame-ruler);
  }
</style>
