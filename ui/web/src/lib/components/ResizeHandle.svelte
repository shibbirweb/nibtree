<!-- A drag handle on a panel's edge: a thin line that turns into an accent bar on hover. Drag or use the arrow keys
     (Shift for bigger steps) to resize; double-click resets. `side` says where the panel is. The preset gives the
     smallest and default size; `min` and `defaultSize` replace them when they come from the layout, such as half
     of a split. -->
<script lang="ts">
  import { useForcedState } from "../logic/forcedState";
  import type { PanelPreset } from "../logic/presets";
  import { draggedSize, keyedSize, type PanelSide } from "../logic/resize";
  import { scales } from "../styles/tokens";

  interface Props {
    size: number;
    side: PanelSide;
    preset: PanelPreset;
    max: number;
    min?: number | null;
    defaultSize?: number | null;
    label: string;
    inPanel?: boolean;
    onresize: (size: number) => void;
    oncommit?: (size: number) => void;
  }

  let {
    size,
    side,
    preset,
    max,
    min: minSize = null,
    defaultSize: resetSize = null,
    label,
    inPanel = false,
    onresize,
    oncommit,
  }: Props = $props();

  const min = $derived(minSize ?? scales.panelMin[preset]);
  const defaultSize = $derived(resetSize ?? scales.panelDefault[preset]);

  const horizontal = $derived(side === "bottom" || side === "top");
  let dragging = $state(false);
  // Pointed at and dragged look the same: the accent bar.
  const forced = useForcedState();
  const active = $derived(dragging || forced() === "hover" || forced() === "dragging");
  let startPosition = 0;
  let startSize = 0;

  function position(event: PointerEvent): number {
    return horizontal ? event.clientY : event.clientX;
  }

  function down(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
    startPosition = position(event);
    startSize = size;
  }

  function move(event: PointerEvent): void {
    if (dragging) {
      onresize(draggedSize(side, startSize, position(event) - startPosition, min, max));
    }
  }

  function finish(event: PointerEvent): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    oncommit?.(size);
  }

  function keydown(event: KeyboardEvent): void {
    const next = keyedSize(side, event.key, event.shiftKey, size, min, max);
    if (next !== null) {
      event.preventDefault();
      onresize(next);
      oncommit?.(next);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="handle"
  class:horizontal
  class:dragging={active}
  class:in-panel={inPanel}
  role="separator"
  aria-orientation={horizontal ? "horizontal" : "vertical"}
  aria-label={label}
  aria-valuenow={size}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  title="Drag to resize, double-click to reset"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={finish}
  onpointercancel={finish}
  ondblclick={() => {
    onresize(defaultSize);
    oncommit?.(defaultSize);
  }}
  onkeydown={keydown}
></div>

<style>
  .handle {
    flex: none;
    position: relative;
    z-index: 20;
    width: var(--resize-handle-hit-area);
    margin: 0 calc((var(--resize-handle-hit-area) - 1px) / -2);
    cursor: col-resize;
    outline: none;
  }

  .handle::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc((var(--resize-handle-hit-area) - var(--resize-handle-line)) / 2);
    width: var(--resize-handle-line);
    background: transparent;
    transition: background var(--motion-fast);
  }

  .handle:hover::after,
  .handle:focus-visible::after,
  .dragging::after {
    left: calc((var(--resize-handle-hit-area) - var(--resize-handle-active-line)) / 2);
    width: var(--resize-handle-active-line);
    background: var(--accent);
  }

  .horizontal {
    width: auto;
    height: var(--resize-handle-hit-area);
    margin: calc((var(--resize-handle-hit-area) - 1px) / -2) 0;
    cursor: row-resize;
  }

  .horizontal::after,
  .horizontal:hover::after,
  .horizontal:focus-visible::after,
  .horizontal.dragging::after {
    top: calc((var(--resize-handle-hit-area) - var(--resize-handle-line)) / 2);
    bottom: auto;
    left: 0;
    right: 0;
    width: auto;
    height: var(--resize-handle-line);
  }

  .horizontal:hover::after,
  .horizontal:focus-visible::after,
  .horizontal.dragging::after {
    top: calc((var(--resize-handle-hit-area) - var(--resize-handle-active-line)) / 2);
    height: var(--resize-handle-active-line);
  }
</style>
