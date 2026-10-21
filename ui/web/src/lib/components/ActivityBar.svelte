<!-- The vertical icon bar beside a side panel: one button per panel, the open one tinted with an accent line, and
     an optional count badge. Items after a `null` entry sit at the bottom; a "divider" entry draws a short line.
     An item's own `active` lets several be on at once (a panel and the terminal); `title` is its tooltip. With
     `movable`, an icon can be dragged to a new place in either bar's top or bottom group (logic/activityLayout.ts):
     a line shows where it lands, Esc cancels, and `onmove` gets the place. -->
<script lang="ts">
  import type { IconName } from "../icons";
  import { activityDrag, activityTargetAt } from "../logic/activityDrag.svelte";
  import type { ActivitySlot, ActivityTarget } from "../logic/activityLayout";
  import Badge from "./Badge.svelte";
  import Icon from "./Icon.svelte";

  interface ActivityItem {
    id: string;
    icon: IconName;
    label: string;
    badge?: number;
    /** Something new in the panel: a small accent dot, for panels without a count. */
    dot?: boolean;
    /** A glyph that looks big at the bar's size (play) is drawn a step smaller. */
    smallIcon?: boolean;
    /** Shown as on, whatever `active` says; for toggles that are on independently. */
    active?: boolean;
    /** The tooltip, such as the name with its shortcut; defaults to `label`. */
    title?: string;
    badgeTone?: "accent" | "danger" | "warning";
  }

  type Entry = ActivityItem | "divider";

  interface Props {
    items: (ActivityItem | null | "divider")[];
    active?: string | null;
    label: string;
    side?: "left" | "right";
    movable?: boolean;
    onselect?: (id: string) => void;
    onmove?: (id: string, target: ActivityTarget) => void;
    oncontextmenu?: (id: string, event: MouseEvent) => void;
  }

  let {
    items,
    active = $bindable(null),
    label,
    side = "left",
    movable = false,
    onselect,
    onmove,
    oncontextmenu,
  }: Props = $props();

  /** The pointer travels this far before a press becomes a drag. */
  const DRAG_START = 4;
  const split = $derived(items.indexOf(null));
  const groups = $derived([
    { slot: `${side}-top` as ActivitySlot, entries: (split < 0 ? items : items.slice(0, split)) as Entry[] },
    { slot: `${side}-bottom` as ActivitySlot, entries: (split < 0 ? [] : items.slice(split + 1)) as Entry[] },
  ]);
  const dragging = $derived(movable && activityDrag.id !== null);

  let press: { id: string; x: number; y: number } | null = null;
  /** The click that ends a drag must not also open the panel. */
  let dropped = false;

  /** The real items' places in a group, for the drop line (dividers do not count). */
  function places(entries: Entry[]): (number | null)[] {
    let index = 0;
    return entries.map((entry) => (entry === "divider" ? null : index++));
  }

  function onpointerdown(event: PointerEvent, id: string): void {
    if (movable && event.button === 0) {
      press = { id, x: event.clientX, y: event.clientY };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
  }

  function onpointermove(event: PointerEvent): void {
    if (!press) {
      return;
    }
    if (activityDrag.id === null && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_START) {
      return;
    }
    activityDrag.id = press.id;
    activityDrag.target = activityTargetAt(event.clientX, event.clientY);
  }

  function finish(drop: boolean): void {
    const id = activityDrag.id;
    const target = activityDrag.target;
    if (id !== null) {
      dropped = true;
      if (drop && target) {
        onmove?.(id, target);
      }
    }
    press = null;
    activityDrag.id = null;
    activityDrag.target = null;
  }

  function onclick(id: string): void {
    if (dropped) {
      dropped = false;
      return;
    }
    active = id;
    onselect?.(id);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && press && activityDrag.id !== null) {
      event.preventDefault();
      finish(false);
    }
  }
</script>

<svelte:window {onkeydown} />

<nav class="activity {side}" class:dragging aria-label={label}>
  {#each groups as group (group.slot)}
    {@const at = places(group.entries)}
    {@const count = at.filter((place) => place !== null).length}
    <div class="group {group.slot.endsWith('top') ? 'top' : 'bottom'}" data-activity-slot={group.slot}>
      {#each group.entries as item, index (typeof item === "object" ? item.id : `divider-${index}`)}
        {#if item === "divider"}
          <div class="divider" role="separator"></div>
        {:else}
          {@const on = item.active ?? item.id === active}
          {#if dragging && activityDrag.target?.slot === group.slot && activityDrag.target.index === at[index]}
            <div class="drop-line" aria-hidden="true"></div>
          {/if}
          <button
            class="item"
            class:active={on}
            class:lifted={activityDrag.id === item.id}
            type="button"
            data-activity-id={item.id}
            aria-label={item.label}
            aria-pressed={on}
            title={item.title ?? item.label}
            onclick={() => onclick(item.id)}
            onpointerdown={(event) => onpointerdown(event, item.id)}
            {onpointermove}
            onpointerup={() => finish(true)}
            onpointercancel={() => finish(false)}
            oncontextmenu={(event) => {
              if (oncontextmenu) {
                event.preventDefault();
                oncontextmenu(item.id, event);
              }
            }}
          >
            <Icon name={item.icon} size={item.smallIcon ? "xlarge" : "activity"} stroke="light" />
            {#if item.dot}
              <span class="dot" aria-hidden="true"></span>
            {/if}
            {#if item.badge}
              <span class="badge"><Badge count={item.badge} tone={item.badgeTone ?? "accent"} /></span>
            {/if}
          </button>
        {/if}
      {/each}
      {#if dragging && activityDrag.target?.slot === group.slot && activityDrag.target.index >= count}
        <div class="drop-line" aria-hidden="true"></div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .activity {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--activity-bar-gap);
    width: var(--activity-bar-width);
    background: var(--panel-alt);
    border-right: 1px solid var(--border-strong);
  }

  .right {
    border-right: none;
    border-left: 1px solid var(--border-strong);
  }

  .item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--activity-bar-item);
    height: var(--activity-bar-item);
    border: none;
    border-radius: var(--activity-bar-radius);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
  }

  .item:hover {
    color: var(--text);
    background: var(--hover);
  }

  .item.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .item.active::before {
    content: "";
    position: absolute;
    top: var(--space-4);
    bottom: var(--space-4);
    left: calc(var(--space-2) * -1);
    width: var(--activity-bar-indicator);
    border-radius: var(--radius-tiny);
    background: var(--accent);
  }

  .right .item.active::before {
    left: auto;
    right: calc(var(--space-2) * -1);
  }

  .group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--activity-bar-gap);
  }

  /* The groups cover the whole bar (the bar's padding is theirs), so a drop anywhere lands in one; the top group
     takes the free room, so a drop below its icons lands at its end. */
  .group.top {
    flex: 1;
    padding-top: var(--activity-bar-padding);
  }

  .group.bottom {
    padding-bottom: var(--activity-bar-padding);
  }

  /* While dragging, an empty bottom group still has room to drop on. */
  .dragging .group.bottom {
    min-height: var(--activity-bar-item);
  }

  .item.lifted {
    opacity: 0.4;
  }

  .dragging .item {
    cursor: grabbing;
  }

  .drop-line {
    flex: none;
    width: var(--activity-bar-item);
    height: var(--activity-bar-indicator);
    border-radius: var(--radius-tiny);
    background: var(--accent);
  }

  .divider {
    flex: none;
    width: var(--activity-bar-separator-width);
    height: 1px;
    margin: var(--activity-bar-separator-space) 0;
    background: var(--border-strong);
  }

  .badge {
    position: absolute;
    right: 1px;
    bottom: var(--activity-bar-badge-bottom);
    display: flex;
  }

  .dot {
    position: absolute;
    top: var(--activity-bar-dot-inset);
    right: var(--activity-bar-dot-inset);
    width: var(--activity-bar-dot);
    height: var(--activity-bar-dot);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 var(--activity-bar-dot-ring) var(--panel-alt);
  }
</style>
