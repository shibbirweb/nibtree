<!-- The list that opens under a breadcrumb: a filter field, then the folder's entries (icon, name in its git color
     with its matches, a chevron for folders) or a message. Arrows, Ctrl+N/P, Page keys and Home/End move, Enter
     picks, Escape closes. With `anchor`, it moves to <body> and places itself under the crumb, or above it when the
     room below is short (logic/crumbs.ts). -->
<script lang="ts">
  import type { IconName } from "../icons";
  import { crumbPlace, crumbPopupKey } from "../logic/crumbs";
  import { strayKeys } from "../logic/dialogFocus";
  import { componentTokens } from "../styles/tokens";
  import FileIcon, { type FileIconView } from "./FileIcon.svelte";
  import HighlightText from "./HighlightText.svelte";
  import Icon from "./Icon.svelte";

  interface CrumbEntry {
    id: string;
    name: string;
    ranges?: [number, number][];
    icon?: IconName;
    fileIcon?: FileIconView;
    tone?: "modified" | "added" | "conflict" | "deleted" | "ignored" | "search";
    folder?: boolean;
    title?: string;
  }

  interface Props {
    entries: CrumbEntry[];
    query?: string;
    selected?: number;
    placeholder?: string;
    message?: string;
    error?: boolean;
    /** A faint line under the entries, such as that only the first 5000 show. */
    note?: string;
    label: string;
    anchor?: HTMLElement | null;
    /** The event tells whether Cmd (Ctrl) was held, to open to the side. */
    onpick: (entry: CrumbEntry, event: KeyboardEvent | MouseEvent) => void;
    /** Runs first for keys in the field; call preventDefault to keep a key from the list. */
    onkeydown?: (event: KeyboardEvent) => void;
    onclose?: () => void;
  }

  let {
    entries,
    query = $bindable(""),
    selected = $bindable(0),
    placeholder = "Filter",
    message = "",
    error = false,
    note = "",
    label,
    anchor = null,
    onpick,
    onkeydown,
    onclose,
  }: Props = $props();

  const listId = $props.id();
  let popup = $state<HTMLDivElement | null>(null);
  let list = $state<HTMLDivElement | null>(null);
  const tokens = componentTokens.crumbPopup;
  const place = $derived(
    anchor
      ? crumbPlace(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, tokens)
      : null,
  );

  /** Whether `node` is inside the list, for a click-outside check. */
  export function contains(node: Node): boolean {
    return popup?.contains(node) ?? false;
  }

  // Keep the selected entry in view.
  $effect(() => {
    list?.querySelectorAll<HTMLElement>('[role="option"]')[selected]?.scrollIntoView({ block: "nearest" });
  });

  function keydown(event: KeyboardEvent): void {
    onkeydown?.(event);
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    const action = crumbPopupKey(event, { selected, count: entries.length, query });
    if (action === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (action === "pick") {
      onpick(entries[selected], event);
    } else if (action === "close") {
      onclose?.();
    } else if (typeof action === "number") {
      selected = action;
    }
  }

  function focus(input: HTMLInputElement): void {
    input.focus();
  }

  /** Floating next to its crumb, out of any container that would clip it. */
  function toBody(node: HTMLElement): { destroy(): void } | undefined {
    if (!anchor) {
      return undefined;
    }
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<svelte:window onkeydown={strayKeys(() => popup, keydown)} />

<div
  bind:this={popup}
  class="popup"
  class:floating={place !== null}
  role="dialog"
  aria-label={label}
  use:toBody
  style:top={place?.top != null ? `${place.top}px` : null}
  style:bottom={place?.bottom != null ? `${place.bottom}px` : null}
  style:left={place ? `${place.left}px` : null}
  style:width={place ? `${place.width}px` : null}
>
  <div class="field">
    <Icon name="search" size="medium" />
    <input
      bind:value={query}
      {placeholder}
      aria-label={label}
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-activedescendant={entries[selected] ? `${listId}-${selected}` : undefined}
      use:focus
      onkeydown={keydown}
    />
  </div>
  <div
    bind:this={list}
    class="list"
    id={listId}
    role="listbox"
    aria-label={label}
    style:max-height={place ? `${place.maxHeight - tokens.fieldHeight}px` : null}
  >
    {#each entries as entry, index (entry.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        id="{listId}-{index}"
        class="row {entry.tone ?? ''}"
        class:selected={index === selected}
        role="option"
        tabindex="-1"
        aria-selected={index === selected}
        title={entry.title}
        onmousemove={() => (selected = index)}
        onmousedown={(event) => event.preventDefault()}
        onclick={(event) => onpick(entry, event)}
      >
        <span class="icon"
          >{#if entry.fileIcon !== undefined}<FileIcon view={entry.fileIcon} />{:else if entry.icon}<Icon
              name={entry.icon}
              size="normal"
            />{/if}</span
        >
        <span class="name"><HighlightText text={entry.name} ranges={entry.ranges ?? []} /></span>
        {#if entry.folder}<span class="more"><Icon name="chevron-right" size="small" /></span>{/if}
      </div>
    {:else}
      {#if message}<div class="message" class:error>{message}</div>{/if}
    {/each}
    {#if note}<div class="message">{note}</div>{/if}
  </div>
</div>

<style>
  .floating {
    position: fixed;
    z-index: var(--crumb-popup-layer);
  }

  .popup {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--panel);
    box-shadow: var(--shadow);
    font-size: var(--font-size-code-small);
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--crumb-popup-gap);
    height: var(--crumb-popup-field-height);
    padding: 0 var(--crumb-popup-field-padding-x);
    border-bottom: 1px solid var(--border-strong);
    color: var(--text-faint);
  }

  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
  }

  .field input::placeholder {
    color: var(--text-faint);
  }

  .list {
    overflow-y: auto;
    padding: var(--crumb-popup-list-padding);
  }

  .row,
  .message {
    display: flex;
    align-items: center;
    gap: var(--crumb-popup-gap);
    height: var(--crumb-popup-row-height);
    padding: 0 var(--crumb-popup-row-padding-x);
    border-radius: var(--radius-small);
    color: var(--text);
  }

  .row {
    cursor: pointer;
  }

  .row.selected {
    background: var(--selected);
  }

  .message {
    color: var(--text-faint);
  }

  .message.error {
    color: var(--danger);
  }

  .icon {
    flex: none;
    display: inline-flex;
    justify-content: center;
    width: var(--crumb-popup-icon-width);
    color: var(--text-dim);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
  }

  .modified .name {
    color: var(--accent);
  }

  .added .name {
    color: var(--success);
  }

  .conflict .name,
  .deleted .name {
    color: var(--danger);
  }

  .ignored .name,
  .ignored .icon {
    color: var(--text-faint);
  }

  .search .name {
    color: var(--text-dim);
  }

  .more {
    flex: none;
    display: inline-flex;
    color: var(--text-faint);
  }
</style>
