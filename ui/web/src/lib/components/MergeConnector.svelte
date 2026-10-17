<!-- The column between two merge or diff panes: a ribbon per chunk joining its lines on both sides, and the chunk's
     buttons (apply its side's change, ignore it, or revert it in its own pane) at its top, kept inside the column
     while any of the chunk shows. Each button shows only with its handler, so a read-only diff draws ribbons alone.
     Ribbons take their chunk's kind color, or fade from the old side's red to the new side's green:
     `oldToNew` when the old side is on the left, `newToOld` when it is on the right. The app
     measures; this draws. -->
<script lang="ts">
  import type { ChunkKind } from "../logic/mergeGeometry";
  import { ribbonPath } from "../logic/mergeGeometry";
  import { componentTokens } from "../styles/tokens";
  import Icon from "./Icon.svelte";

  export type ConnectorColors = "kinds" | "oldToNew" | "newToOld";

  export interface ConnectorRibbon {
    index: number;
    kind: ChunkKind;
    aTop: number;
    aBottom: number;
    bTop: number;
    bBottom: number;
    /** The change is added after the other side's (both sides added lines): the title says Append. */
    append?: boolean;
  }

  interface Props {
    ribbons: ConnectorRibbon[];
    side: "left" | "right";
    onapply?: (index: number) => void;
    onignore?: (index: number) => void;
    onrevert?: (index: number) => void;
    applyTitle?: string | null;
    revertTitle?: string | null;
    colors?: ConnectorColors;
  }

  let {
    ribbons,
    side,
    onapply,
    onignore,
    onrevert,
    applyTitle = null,
    revertTitle = null,
    colors = "kinds",
  }: Props = $props();

  /** Unique per connector, so the gradients of several diffs on screen never mix. */
  const gradient = $props.id();

  /** Narrow when it draws ribbons alone: the buttons then sit in the panes' gutters, or there are none. */
  const buttons = $derived(Boolean(onapply || onignore || onrevert));
  const width = $derived(buttons ? componentTokens.mergeView.gap : componentTokens.mergeView.ribbonGap);
  const { buttonHeight, buttonInset } = componentTokens.mergeView;
  let height = $state(0);

  /** The buttons' top: at the chunk's first line, but never above or below the column. */
  function buttonTop(top: number): number {
    if (height <= 0) {
      return top + 1;
    }
    return Math.max(buttonInset, Math.min(height - buttonHeight - buttonInset, top + 1));
  }
</script>

<div class="connector" class:narrow={!buttons} bind:clientHeight={height}>
  <svg {width} aria-hidden="true">
    {#if colors !== "kinds"}
      <defs>
        <linearGradient id="{gradient}-fill">
          <stop offset="0" class={colors === "oldToNew" ? "old-fill" : "new-fill"} />
          <stop offset="1" class={colors === "oldToNew" ? "new-fill" : "old-fill"} />
        </linearGradient>
        <linearGradient id="{gradient}-edge">
          <stop offset="0" class={colors === "oldToNew" ? "old-edge" : "new-edge"} />
          <stop offset="1" class={colors === "oldToNew" ? "new-edge" : "old-edge"} />
        </linearGradient>
      </defs>
    {/if}
    {#each ribbons as ribbon (ribbon.index)}
      <path
        class="ribbon {colors === 'kinds' ? ribbon.kind : ''}"
        d={ribbonPath(ribbon.aTop, ribbon.aBottom, ribbon.bTop, ribbon.bBottom, width)}
        fill={colors === "kinds" ? undefined : `url(#${gradient}-fill)`}
        stroke={colors === "kinds" ? undefined : `url(#${gradient}-edge)`}
      />
    {/each}
  </svg>
  {#if buttons}
    {#each ribbons as ribbon (ribbon.index)}
      <!-- Apply sits next to its own pane: first on the left, last on the right. -->
      <div class="buttons {side}" style:top="{buttonTop(side === 'left' ? ribbon.aTop : ribbon.bTop)}px">
        {#if side === "right"}{@render ignoreButton(ribbon.index)}{@render revertButton(ribbon.index)}{/if}
        {#if onapply}
          <button
            class="chunk-btn apply {ribbon.kind}"
            type="button"
            title={applyTitle ?? `${ribbon.append ? "Append" : "Apply"} ${side} change`}
            onclick={() => onapply(ribbon.index)}
          >
            <Icon name={side === "left" ? "chevrons-right" : "chevrons-left"} size="compact" stroke="bold" />
          </button>
        {/if}
        {#if side === "left"}{@render revertButton(ribbon.index)}{@render ignoreButton(ribbon.index)}{/if}
      </div>
    {/each}
  {/if}
</div>

{#snippet ignoreButton(index: number)}
  {#if onignore}
    <button class="chunk-btn ignore" type="button" title="Ignore {side} change" onclick={() => onignore(index)}>
      <Icon name="x" size="small" stroke="bold" />
    </button>
  {/if}
{/snippet}

{#snippet revertButton(index: number)}
  {#if onrevert}
    <button
      class="chunk-btn revert"
      type="button"
      title={revertTitle ?? `Revert ${side} change`}
      onclick={() => onrevert(index)}
    >
      <Icon name="discard" size="small" stroke="bold" />
    </button>
  {/if}
{/snippet}

<style>
  .connector {
    flex: none;
    width: var(--merge-view-gap);
    position: relative;
    overflow: hidden;
    background: var(--editor-bg);
  }

  .connector.narrow {
    width: var(--merge-view-ribbon-gap);
  }

  svg {
    position: absolute;
    inset: 0;
    height: 100%;
  }

  .ribbon {
    stroke-width: 1;
  }

  .old-fill {
    stop-color: var(--diff-removed);
  }

  .new-fill {
    stop-color: var(--diff-added);
  }

  .old-edge {
    stop-color: var(--danger);
  }

  .new-edge {
    stop-color: var(--diff-added-edge);
  }

  .modified {
    fill: var(--diff-modified);
    stroke: var(--diff-modified-edge);
  }

  .added {
    fill: var(--diff-added);
    stroke: var(--diff-added-edge);
  }

  .deleted {
    fill: var(--diff-deleted);
    stroke: var(--diff-deleted-edge);
  }

  .conflict {
    fill: var(--diff-conflict);
    stroke: var(--diff-conflict-edge);
  }

  .buttons {
    position: absolute;
    display: flex;
    gap: var(--space-1);
  }

  .buttons.left {
    left: var(--space-1);
  }

  .buttons.right {
    right: var(--space-1);
  }

  .chunk-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--merge-view-button-width);
    height: var(--merge-view-button-height);
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-small);
    background: var(--panel);
    color: var(--text-dim);
    cursor: pointer;
  }

  .chunk-btn:hover {
    color: var(--text);
    border-color: var(--text-dim);
  }

  .chunk-btn.apply.modified {
    color: var(--diff-modified-edge);
  }

  .chunk-btn.apply.added {
    color: var(--diff-added-edge);
  }

  .chunk-btn.apply.deleted {
    color: var(--diff-deleted-edge);
  }

  .chunk-btn.apply.conflict {
    color: var(--diff-conflict-edge);
  }

  .chunk-btn.ignore:hover,
  .chunk-btn.revert:hover {
    color: var(--danger);
  }
</style>
