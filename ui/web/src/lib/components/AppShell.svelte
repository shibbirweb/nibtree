<!-- The window layout: header and banners on top, activity bars on the outer edges, a resizable side panel on each
     side, the editor area with an optional bottom panel, and the status bar. Panel sizes are data the user drags;
     they are kept so the editor area never gets narrower or shorter than its minimum. In the rounded look the window
     frame shows around the panels, and `tint` lights its top left corner in the project's color. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { presetVar, type ProjectTint, type ViewHeight } from "../logic/presets";
  import { bottomPanelMax, clampPanel, sidePanelMax } from "../logic/shellLayout";
  import { componentTokens, scales } from "../styles/tokens";
  import ResizeHandle from "./ResizeHandle.svelte";

  interface Props {
    look?: "flat" | "rounded";
    /** The rounded look's glow at the top left of the frame; the flat look leaves it to AppHeader. */
    tint?: ProjectTint;
    height?: ViewHeight;
    sidebarWidth?: number;
    rightWidth?: number;
    bottomHeight?: number;
    sidebarLabel?: string;
    rightLabel?: string;
    bottomLabel?: string;
    bottomHidden?: boolean;
    oncommit?: () => void;
    header?: Snippet;
    banners?: Snippet;
    leftBar?: Snippet;
    sidebar?: Snippet;
    editor: Snippet;
    bottom?: Snippet;
    right?: Snippet;
    rightBar?: Snippet;
    statusBar?: Snippet;
  }

  let {
    look = "flat",
    tint = "none",
    height = "fill",
    sidebarWidth = $bindable(scales.panelDefault.sidebar),
    rightWidth = $bindable(scales.panelDefault.sidebar),
    bottomHeight = $bindable(scales.panelDefault.bottom),
    sidebarLabel = "Resize sidebar",
    rightLabel = "Resize right sidebar",
    bottomLabel = "Resize bottom panel",
    bottomHidden = false,
    oncommit,
    header,
    banners,
    leftBar,
    sidebar,
    editor,
    bottom,
    right,
    rightBar,
    statusBar,
  }: Props = $props();

  const shownHeight = $derived(height === "fill" ? null : presetVar("viewHeight", height));
  const minSide = scales.panelMin.sidebar;
  const minBottom = scales.panelMin.bottom;
  const { minMain, minEditorHeight } = componentTokens.appShell;

  let bodyWidth = $state(0);
  let leftBarWidth = $state(0);
  let rightBarWidth = $state(0);
  let mainHeight = $state(0);

  const bars = $derived(leftBarWidth + rightBarWidth);
  const shownRight = $derived(right ? clampPanel(rightWidth, minSide, 0) : 0);
  const sidebarMax = $derived(bodyWidth ? sidePanelMax(bodyWidth, bars, shownRight, minMain, minSide) : 0);
  const shownSidebar = $derived(clampPanel(sidebarWidth, minSide, sidebarMax));
  const rightMax = $derived(
    bodyWidth ? sidePanelMax(bodyWidth, bars, sidebar ? shownSidebar : 0, minMain, minSide) : 0,
  );
  const shownRightWidth = $derived(clampPanel(rightWidth, minSide, rightMax));
  const bottomMax = $derived(mainHeight ? bottomPanelMax(mainHeight, minEditorHeight, minBottom) : 0);
  const shownBottom = $derived(clampPanel(bottomHeight, minBottom, bottomMax));
</script>

<div
  class="shell tint-{tint}"
  class:rounded={look === "rounded"}
  style:--shell-tint={tint === "none" ? null : `var(--term-${tint})`}
  style:height={shownHeight}
  style:flex={shownHeight && "none"}
>
  {@render header?.()}
  <div class="banners">{@render banners?.()}</div>
  <div class="body" bind:clientWidth={bodyWidth}>
    {#if leftBar}
      <div class="bar" bind:clientWidth={leftBarWidth}>{@render leftBar()}</div>
    {/if}
    {#if sidebar}
      <aside class="panel left" aria-label="Left panel" style:width="{shownSidebar}px">{@render sidebar()}</aside>
      <ResizeHandle
        side="left"
        preset="sidebar"
        size={shownSidebar}
        max={Math.max(minSide, sidebarMax)}
        label={sidebarLabel}
        onresize={(size) => (sidebarWidth = size)}
        oncommit={() => oncommit?.()}
      />
    {/if}
    <main class="main" bind:clientHeight={mainHeight}>
      <div class="editor">{@render editor()}</div>
      {#if bottom && !bottomHidden}
        <ResizeHandle
          side="bottom"
          preset="bottom"
          size={shownBottom}
          max={Math.max(minBottom, bottomMax)}
          label={bottomLabel}
          onresize={(size) => (bottomHeight = size)}
          oncommit={() => oncommit?.()}
        />
      {/if}
      {#if bottom}
        <!-- Stays mounted while hidden, so what runs in it (parked terminals) keeps running. -->
        <section
          class="panel bottom"
          class:hidden={bottomHidden}
          aria-label="Bottom panel"
          style:height="{shownBottom}px"
        >
          {@render bottom()}
        </section>
      {/if}
    </main>
    {#if right}
      <ResizeHandle
        side="right"
        preset="sidebar"
        size={shownRightWidth}
        max={Math.max(minSide, rightMax)}
        label={rightLabel}
        onresize={(size) => (rightWidth = size)}
        oncommit={() => oncommit?.()}
      />
      <aside class="panel right" aria-label="Right panel" style:width="{shownRightWidth}px">{@render right()}</aside>
    {/if}
    {#if rightBar}
      <div class="bar" bind:clientWidth={rightBarWidth}>{@render rightBar()}</div>
    {/if}
  </div>
  {@render statusBar?.()}
</div>

<style>
  .shell {
    flex: 1;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--panel);
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .bar {
    flex: none;
    display: flex;
  }

  .panel {
    flex: none;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--panel);
  }

  .left {
    border-right: 1px solid var(--border-strong);
  }

  .right {
    border-left: 1px solid var(--border-strong);
  }

  .bottom {
    border-top: 1px solid var(--border-strong);
  }

  .hidden {
    display: none;
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
  }

  .editor {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Rounded panels sit apart on the window frame, which the shell paints once under the header, the activity bars
     and the gaps, so the glow runs across all of them; the resize handles fill the gaps. */
  .rounded {
    background-color: var(--frame);
  }

  /* The project's glow: strongest in the top left corner and easing out to the right and down, with no edge. A light
     theme gets a much fainter one, so the dim icons on the frame keep their contrast. The color is the tile's
     terminal color, so it follows the color theme. */
  .rounded:not(.tint-none) {
    --glow-start: light-dark(
      color-mix(in srgb, var(--shell-tint) 12%, transparent),
      color-mix(in srgb, var(--shell-tint) 26%, transparent)
    );
    --glow-middle: light-dark(
      color-mix(in srgb, var(--shell-tint) 6%, transparent),
      color-mix(in srgb, var(--shell-tint) 13%, transparent)
    );
    --glow-end: light-dark(
      color-mix(in srgb, var(--shell-tint) 2%, transparent),
      color-mix(in srgb, var(--shell-tint) 4%, transparent)
    );
    background-image: radial-gradient(
      var(--app-shell-tint-width) var(--app-shell-tint-height) at 0 0,
      var(--glow-start) 0%,
      var(--glow-middle) 35%,
      var(--glow-end) 65%,
      transparent 100%
    );
    background-repeat: no-repeat;
  }

  /* Banners are rounded panels too, a gap from the window's edges and from the panels under them. */
  .rounded .banners > :global(*) {
    margin: 0 var(--app-shell-panel-gap) var(--app-shell-panel-gap);
    border: none;
    border-radius: var(--app-shell-panel-radius);
    overflow: hidden;
  }

  .rounded .body {
    gap: var(--app-shell-panel-gap);
    padding: 0 var(--app-shell-panel-gap) var(--app-shell-panel-gap);
    background: transparent;
  }

  /* The handles between rounded panels fill the gaps; handles inside a panel (editor groups) keep their size. */
  .rounded .body > :global(.handle:not(.in-panel)) {
    width: var(--app-shell-panel-gap);
    margin: 0 calc(var(--app-shell-panel-gap) * -1);
  }

  .rounded .main > :global(.handle.horizontal:not(.in-panel)) {
    width: auto;
    height: var(--app-shell-panel-gap);
    margin: calc(var(--app-shell-panel-gap) * -1) 0;
  }

  /* Activity bars are stripes on the window frame, flush with the window edge. */
  .rounded .bar:first-child {
    margin-left: calc(var(--app-shell-panel-gap) * -1);
  }

  .rounded .bar:last-child {
    margin-right: calc(var(--app-shell-panel-gap) * -1);
  }

  .rounded .bar > :global(.activity) {
    background: transparent;
    border: none;
  }

  .rounded .main {
    gap: var(--app-shell-panel-gap);
    background: transparent;
  }

  .rounded .panel,
  .rounded .editor {
    border: none;
    border-radius: var(--app-shell-panel-radius);
    overflow: hidden;
    background: var(--panel);
  }
</style>
