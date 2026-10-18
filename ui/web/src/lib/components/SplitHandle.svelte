<!-- A handle between two side-by-side views inside one box, like the split diff's: drag it or use the arrow keys
     (Shift for bigger steps) to move the split, which `ratio` holds (0 to 1, data); double-click puts it back at
     `resetRatio` (the middle). Its parent must be positioned. `gutter` px between the sides, such as a diff's change
     arrows, never grow. -->
<script lang="ts">
  import { useForcedState } from "../logic/forcedState";
  import { keyedRatio, pointerRatio } from "../logic/splitRatio";

  interface Props {
    ratio?: number;
    gutter?: number;
    /** Where a double-click puts the split back; a 3-pane view's handles go back to even thirds. */
    resetRatio?: number;
    label: string;
    oncommit?: (ratio: number) => void;
  }

  let { ratio = $bindable(0.5), gutter = 0, resetRatio = 0.5, label, oncommit }: Props = $props();

  let dragging = $state(false);
  // Pointed at and dragged look the same: the accent line.
  const forced = useForcedState();
  const active = $derived(dragging || forced() === "hover" || forced() === "dragging");
  let handle = $state<HTMLDivElement | null>(null);

  function move(event: PointerEvent): void {
    const box = handle?.parentElement?.getBoundingClientRect();
    if (dragging && box) {
      ratio = pointerRatio(event.clientX, box.left, box.width, gutter);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={handle}
  class="split-handle"
  class:dragging={active}
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuenow={Math.round(ratio * 100)}
  aria-valuemin={0}
  aria-valuemax={100}
  tabindex="0"
  style:left="calc((100% - {gutter}px) * {ratio})"
  onpointerdown={(event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
  }}
  onpointermove={move}
  onpointerup={() => {
    dragging = false;
    oncommit?.(ratio);
  }}
  ondblclick={() => {
    ratio = 0.5;
    oncommit?.(ratio);
  }}
  onkeydown={(event) => {
    const next = keyedRatio(ratio, event.key, event.shiftKey);
    if (next !== null) {
      event.preventDefault();
      ratio = next;
      oncommit?.(ratio);
    }
  }}
></div>

<style>
  .split-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: var(--split-handle-layer);
    width: var(--split-handle-width);
    margin-left: calc(var(--split-handle-width) / -2);
    cursor: col-resize;
    outline: none;
  }

  .split-handle::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc((var(--split-handle-width) - var(--split-handle-line)) / 2);
    width: var(--split-handle-line);
    background: transparent;
    transition: background var(--motion-fast);
  }

  .split-handle:hover::after,
  .split-handle:focus-visible::after,
  .dragging::after {
    background: var(--accent);
  }
</style>
