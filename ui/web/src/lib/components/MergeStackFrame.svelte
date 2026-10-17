<!-- The frame of a 3-way merge in two rows: your version and theirs side by side on top, the result across the
     bottom, each under its own title. Like MergeFrame it draws no editor: `onready` hands over the three panes (and
     the result as the box ribbons would be measured from; this layout has none). The app adds its own bits to the
     result's title, such as how many changes are left, with `resultEnd`. Drag the line under the top row to give the
     result more room, or the line between the top panes to widen one; double-click it to even them. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { MergeFrameParts } from "./MergeFrame.svelte";
  import SplitHandle from "./SplitHandle.svelte";
  import SplitPane from "./SplitPane.svelte";
  import { componentTokens } from "../styles/tokens";

  interface Props {
    label: string;
    labels?: { left: string; result: string; right: string };
    fileName?: string;
    /** The top row's height in px; 0 starts it at half the frame. */
    topHeight?: number;
    /** The split between the two top panes. */
    ratio?: number;
    oncommit?: (topHeight: number, ratio: number) => void;
    resultEnd?: Snippet;
    onready?: (parts: MergeFrameParts) => void | (() => void);
  }

  let {
    label,
    labels = { left: "Yours", result: "Result", right: "Theirs" },
    fileName = "",
    topHeight = $bindable(0),
    ratio = $bindable(0.5),
    oncommit,
    resultEnd,
    onready,
  }: Props = $props();

  let left = $state<HTMLDivElement | null>(null);
  let result = $state<HTMLDivElement | null>(null);
  let right = $state<HTMLDivElement | null>(null);
  let height = $state(0);
  const RESULT_MIN = componentTokens.mergeView.stackResultMin;

  // Half the frame at first; a saved height that no longer fits (a smaller window) leaves the result its room.
  $effect(() => {
    if (height > 0 && (topHeight <= 0 || topHeight > height - RESULT_MIN)) {
      topHeight = Math.max(RESULT_MIN, Math.round(height / 2));
    }
  });

  $effect(() => {
    if (left && result && right && onready) {
      return onready({ left, result, right, panes: result }) ?? undefined;
    }
  });
</script>

<div class="stack" role="region" aria-label={label} bind:clientHeight={height}>
  <SplitPane
    direction="column"
    bind:size={topHeight}
    max={Math.max(0, height - RESULT_MIN)}
    label="Resize the top panes and the result"
    inPanel
    oncommit={() => oncommit?.(topHeight, ratio)}
  >
    {#snippet first()}
      <div class="row" style:--stack-left={ratio}>
        <div class="column">
          <div class="title" title={labels.left}>{labels.left}</div>
          <div class="pane" bind:this={left}></div>
        </div>
        <div class="column right">
          <div class="title" title={labels.right}>{labels.right}</div>
          <div class="pane" bind:this={right}></div>
        </div>
        <SplitHandle bind:ratio label="Resize the two top panes" oncommit={() => oncommit?.(topHeight, ratio)} />
      </div>
    {/snippet}
    {#snippet second()}
      <div class="column result">
        <div class="title result-title">
          <span class="name"
            >{labels.result}
            {#if fileName}<span class="file">{fileName}</span>{/if}</span
          >
          {#if resultEnd}<span class="end">{@render resultEnd()}</span>{/if}
        </div>
        <div class="pane" bind:this={result}></div>
      </div>
    {/snippet}
  </SplitPane>
</div>

<style>
  .stack {
    flex: 1;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .row {
    position: relative;
    flex: 1;
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .column {
    display: flex;
    flex-direction: column;
    flex: var(--stack-left) 1 0;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .column.right {
    flex-grow: calc(1 - var(--stack-left));
    border-left: 1px solid var(--border-strong);
  }

  .title {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--merge-view-label-padding-x);
    min-width: 0;
    padding: var(--merge-view-label-padding-y) var(--merge-view-label-padding-x);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--panel-alt);
    border-bottom: 1px solid var(--border-strong);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-semibold);
  }

  .result-title {
    border-top: 1px solid var(--border-strong);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file {
    color: var(--text-dim);
  }

  .end {
    flex: none;
    font-weight: var(--font-weight-normal);
  }

  .pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--editor-bg);
  }

  .pane :global(.cm-editor) {
    height: 100%;
  }
</style>
