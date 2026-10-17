<!-- The frame of a 3-way merge: the three panes' titles, the three panes that MergeView (or the app's merge tool)
     fills with editors, and the connector columns between them. It draws no editor: `onready` hands over the pane
     elements and the box the ribbons are measured from, and the ribbons come back as props. Without `onapply` and
     `onignore` the connectors draw ribbons alone, in a narrower gap: for a read-only 3-pane diff, or when the panes
     put their buttons in their own gutters (editor/mergeGutters.ts, as MergeView and the app do); `colors` picks
     each connector's ribbon colors (by kind, or red to green from the older pane to the newer). A handle on each
     connector's edge resizes the panes, which `split` holds; double-click puts them back to even thirds. -->
<script module lang="ts">
  export interface MergeFrameParts {
    left: HTMLDivElement;
    result: HTMLDivElement;
    right: HTMLDivElement;
    /** The ribbons' tops are measured from this box's top. */
    panes: HTMLDivElement;
  }
</script>

<script lang="ts">
  import { presetVar, type ViewHeight } from "../logic/presets";
  import { EVEN_THREE_SPLIT, moveThreeSplit, type ThreeSplit } from "../logic/threeSplit";
  import { componentTokens } from "../styles/tokens";
  import MergeConnector, { type ConnectorColors, type ConnectorRibbon } from "./MergeConnector.svelte";
  import SplitHandle from "./SplitHandle.svelte";

  interface Props {
    label: string;
    labels?: { left: string; result: string; right: string };
    fileName?: string;
    height?: ViewHeight;
    leftRibbons?: ConnectorRibbon[];
    rightRibbons?: ConnectorRibbon[];
    onapply?: (index: number, side: "left" | "right") => void;
    onignore?: (index: number, side: "left" | "right") => void;
    onrevert?: (index: number, side: "left" | "right") => void;
    applyTitles?: { left: string; right: string } | null;
    revertTitle?: string | null;
    /** The connectors whose chunks get buttons; the others draw ribbons alone. */
    actionSides?: ("left" | "right")[];
    colors?: { left: ConnectorColors; right: ConnectorColors };
    split?: ThreeSplit;
    oncommitsplit?: (split: ThreeSplit) => void;
    onready?: (parts: MergeFrameParts) => void | (() => void);
  }

  let {
    label,
    labels = { left: "Yours", result: "Result", right: "Theirs" },
    fileName = "",
    height = "fill",
    leftRibbons = [],
    rightRibbons = [],
    onapply,
    onignore,
    onrevert,
    applyTitles = null,
    revertTitle = null,
    actionSides = ["left", "right"],
    colors = { left: "kinds", right: "kinds" },
    split = $bindable(EVEN_THREE_SPLIT),
    oncommitsplit,
    onready,
  }: Props = $props();

  const shownHeight = $derived(height === "fill" ? null : presetVar("viewHeight", height));
  let left = $state<HTMLDivElement | null>(null);
  let result = $state<HTMLDivElement | null>(null);
  let right = $state<HTMLDivElement | null>(null);
  let panes = $state<HTMLDivElement | null>(null);
  const buttons = $derived(Boolean(onapply || onignore || onrevert));
  const gap = $derived(buttons ? componentTokens.mergeView.gap : componentTokens.mergeView.ribbonGap);
  const acts = (side: "left" | "right") => actionSides.includes(side);

  $effect(() => {
    if (left && result && right && panes && onready) {
      return onready({ left, result, right, panes }) ?? undefined;
    }
  });
</script>

<div
  class="merge"
  role="region"
  aria-label={label}
  style:height={shownHeight}
  style:flex={shownHeight && "none"}
  style:--merge-left={split[0]}
  style:--merge-result={split[1] - split[0]}
  style:--merge-right={1 - split[1]}
  style:--merge-gap={buttons ? "var(--merge-view-gap)" : "var(--merge-view-ribbon-gap)"}
>
  <div class="labels">
    <div class="label" title={labels.left}>{labels.left}</div>
    <div class="label-gap"></div>
    <div class="label result">
      {labels.result}
      {#if fileName}<span class="file">{fileName}</span>{/if}
    </div>
    <div class="label-gap"></div>
    <div class="label theirs" title={labels.right}>{labels.right}</div>
  </div>
  <div class="panes" bind:this={panes}>
    <div class="pane" bind:this={left}></div>
    <MergeConnector
      ribbons={leftRibbons}
      side="left"
      onapply={onapply && acts("left") ? (index) => onapply(index, "left") : undefined}
      applyTitle={applyTitles?.left ?? null}
      onignore={onignore && acts("left") ? (index) => onignore(index, "left") : undefined}
      onrevert={onrevert && acts("left") ? (index) => onrevert(index, "left") : undefined}
      {revertTitle}
      colors={colors.left}
    />
    <div class="pane result-pane" bind:this={result}></div>
    <MergeConnector
      ribbons={rightRibbons}
      side="right"
      onapply={onapply && acts("right") ? (index) => onapply(index, "right") : undefined}
      applyTitle={applyTitles?.right ?? null}
      onignore={onignore && acts("right") ? (index) => onignore(index, "right") : undefined}
      onrevert={onrevert && acts("right") ? (index) => onrevert(index, "right") : undefined}
      {revertTitle}
      colors={colors.right}
    />
    <div class="pane right-pane" bind:this={right}></div>
    <!-- Each box leaves out the other connector, so a handle's ratio is a share of the width the panes share. -->
    <div class="handle-box first">
      <SplitHandle
        bind:ratio={() => split[0], (ratio) => (split = moveThreeSplit(split, 0, ratio))}
        gutter={gap}
        resetRatio={EVEN_THREE_SPLIT[0]}
        label="Resize the left and middle panes"
        oncommit={() => oncommitsplit?.(split)}
      />
    </div>
    <div class="handle-box second">
      <SplitHandle
        bind:ratio={() => split[1], (ratio) => (split = moveThreeSplit(split, 1, ratio))}
        gutter={gap}
        resetRatio={EVEN_THREE_SPLIT[1]}
        label="Resize the middle and right panes"
        oncommit={() => oncommitsplit?.(split)}
      />
    </div>
  </div>
</div>

<style>
  .merge {
    flex: 1;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .labels {
    flex: none;
    display: flex;
    background: var(--panel-alt);
    border-bottom: 1px solid var(--border-strong);
    font-size: var(--font-size-small);
  }

  .label {
    min-width: 0;
    padding: var(--merge-view-label-padding-y) var(--merge-view-label-padding-x);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--font-weight-semibold);
  }

  .label.result {
    text-align: center;
  }

  /* The labels and panes share the split; the connectors between them never grow. */
  .label,
  .pane {
    flex: var(--merge-left) 1 0;
  }

  .label.result,
  .pane.result-pane {
    flex-grow: var(--merge-result);
  }

  .label.theirs,
  .pane.right-pane {
    flex-grow: var(--merge-right);
  }

  .file {
    color: var(--text-dim);
  }

  .label.theirs {
    text-align: right;
  }

  .label-gap {
    flex: none;
    width: var(--merge-gap);
  }

  .panes {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
  }

  .pane {
    min-width: 0;
    overflow: hidden;
    background: var(--editor-bg);
  }

  .pane :global(.cm-editor) {
    height: 100%;
  }

  .handle-box {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
  }

  .handle-box.first {
    left: 0;
    right: var(--merge-gap);
  }

  .handle-box.second {
    left: var(--merge-gap);
    right: 0;
  }

  .handle-box :global(.split-handle) {
    pointer-events: auto;
  }

  .result-pane {
    box-shadow:
      inset 1px 0 0 var(--border-strong),
      inset -1px 0 0 var(--border-strong);
  }
</style>
