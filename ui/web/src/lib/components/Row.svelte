<!-- One row of a list: the base every list row is built on. It draws the hover, the selected color (stronger while
     its List has the focus), an optional fold chevron and indent, and actions that show on hover and on the selected
     row (so the keyboard and screen readers reach them too). The content is
     composed from Text, Icon, Tag and the like; a Spacer pushes what follows to the end. Inside a List the List
     owns the keyboard and the selection; alone, a Row with `onclick` is a button. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { isInsideList } from "../logic/listContext";
  import Icon from "./Icon.svelte";

  type RowSize = "tree" | "list" | "history" | "entry" | "large" | "section" | "group";

  interface Props {
    size?: RowSize;
    selected?: boolean;
    disabled?: boolean;
    depth?: number;
    expanded?: boolean | "leaf" | null;
    align?: "center" | "baseline";
    actionsShown?: "hover" | "always";
    line?: boolean;
    /** An accent stripe on its left edge, such as the active repository's header. */
    mark?: boolean;
    /** The hand cursor, for rows that open something like a link (the Welcome screen's projects). */
    cursor?: "default" | "pointer";
    title?: string;
    label?: string;
    /** Its element id, so a list that keeps the focus elsewhere can point at it or scroll to it. */
    id?: string;
    /** An item of a ListRegion that keeps the keys: its role and selection for screen readers, and no tab stop. */
    item?: "option" | "treeitem" | null;
    actions?: Snippet;
    children: Snippet;
    onclick?: (event: MouseEvent) => void;
    ondblclick?: (event: MouseEvent) => void;
    oncontextmenu?: (event: MouseEvent) => void;
    onhover?: () => void;
  }

  let {
    size = "list",
    selected = false,
    disabled = false,
    depth = 0,
    expanded = null,
    align = "center",
    actionsShown = "hover",
    line = false,
    mark = false,
    cursor = "default",
    title,
    label,
    id,
    item = null,
    actions,
    children,
    onclick,
    ondblclick,
    oncontextmenu,
    onhover,
  }: Props = $props();

  const inList = isInsideList();
  const button = $derived(!inList && item === null && onclick !== undefined);
  const start = $derived(size === "group" ? "padding-left" : "padding-x");
  const indent = $derived(depth > 0 ? `calc(var(--row-${size}-${start}) + ${depth} * var(--row-indent))` : null);

  /** Clicks on a control inside the row (an action button, a rename field) belong to that control. */
  function onControl(event: MouseEvent): boolean {
    const control = (event.target as Element | null)?.closest("button, a, input, select, textarea, [role='button']");
    return control !== null && control !== undefined && control !== event.currentTarget;
  }

  function onkeydown(event: KeyboardEvent) {
    if (!button || disabled || event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      (event.currentTarget as HTMLElement).click();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
<div
  class="row {size}"
  class:interactive={inList || onclick !== undefined}
  class:pointer={cursor === "pointer" && !disabled}
  class:selected
  class:disabled
  class:baseline={align === "baseline"}
  class:line
  class:mark
  role={item ?? (button ? "button" : undefined)}
  tabindex={button && !disabled ? 0 : item ? -1 : undefined}
  aria-selected={item ? selected : undefined}
  aria-label={label}
  {id}
  aria-disabled={button && disabled ? true : undefined}
  aria-expanded={(button || item === "treeitem") && typeof expanded === "boolean" ? expanded : undefined}
  {title}
  style:padding-left={indent}
  onclick={(event) => {
    if (!disabled && !onControl(event)) {
      onclick?.(event);
    }
  }}
  ondblclick={(event) => {
    if (!disabled && !onControl(event)) {
      ondblclick?.(event);
    }
  }}
  oncontextmenu={(event) => oncontextmenu?.(event)}
  onmousemove={() => onhover?.()}
  {onkeydown}
>
  {#if expanded !== null}
    <span class="chevron" aria-hidden="true">
      {#if expanded !== "leaf"}<Icon name={expanded ? "chevron-down" : "chevron-right"} size="compact" />{/if}
    </span>
  {/if}
  {@render children()}
  {#if actions}
    <span class="actions" class:always={actionsShown === "always"}>{@render actions()}</span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    min-width: 0;
    color: var(--text);
    cursor: default;
    outline: none;
  }

  .baseline {
    align-items: baseline;
  }

  .tree {
    gap: var(--row-tree-gap);
    height: var(--row-tree-height);
    padding: 0 var(--row-tree-padding-x);
  }

  .list {
    gap: var(--row-list-gap);
    height: var(--row-list-height);
    padding: 0 var(--row-list-padding-x);
  }

  .history {
    gap: var(--row-history-gap);
    height: var(--row-history-height);
    padding: 0 var(--row-history-padding-x);
  }

  .entry {
    gap: var(--row-entry-gap);
    padding: var(--row-entry-padding-y) var(--row-entry-padding-x);
  }

  .large {
    gap: var(--row-large-gap);
    min-height: var(--row-large-min-height);
    padding: var(--row-large-padding-y) var(--row-large-padding-x);
    border-radius: var(--row-large-radius);
  }

  /* A repository's header in the Changes panel: taller than a list row. */
  .section {
    gap: var(--row-section-gap);
    min-height: var(--row-section-height);
    padding: 0 var(--row-section-padding-x);
  }

  /* A row under a Collapsible's header, its content lined up with the header's title (No Changes). */
  .group {
    gap: var(--row-group-gap);
    height: var(--row-group-height);
    padding: 0 var(--row-group-padding-right) 0 var(--row-group-padding-left);
  }

  .mark {
    position: relative;
  }

  .mark::before {
    content: "";
    position: absolute;
    left: 0;
    top: var(--row-mark-inset);
    bottom: var(--row-mark-inset);
    width: var(--row-mark-width);
    border-radius: 0 var(--radius-tiny) var(--radius-tiny) 0;
    background: var(--accent);
  }

  /* A line under the row, for rows in a ListBox; the box drops the last one. */
  .line {
    border-bottom: 1px solid var(--border);
  }

  .interactive:hover {
    background: var(--hover);
  }

  .pointer {
    cursor: pointer;
  }

  .row.selected,
  .row.selected:hover {
    background: var(--selected-inactive);
  }

  :global([role="listbox"]:focus-within) .row.selected,
  :global([role="tree"]:focus-within) .row.selected,
  :global([data-driven]) .row.selected {
    background: var(--selected);
  }

  .row.disabled {
    color: var(--text-faint);
    background: transparent;
  }

  .row:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .chevron {
    flex: none;
    display: inline-flex;
    justify-content: center;
    width: var(--row-chevron);
    color: var(--text-dim);
  }

  .actions {
    flex: none;
    display: none;
    align-items: center;
    gap: var(--row-actions-gap);
    margin-left: auto;
  }

  .always,
  .row:hover .actions,
  .row.selected .actions,
  .row:focus-within .actions {
    display: flex;
  }
</style>
