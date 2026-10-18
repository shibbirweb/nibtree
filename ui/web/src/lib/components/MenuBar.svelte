<!-- A bar of menus under their names, like a window's File, Edit and View. Click a name to open its menu; while one
     is open, pointing at another name opens that one. Left and Right move along the bar (also from inside an open
     menu), Down, Enter or Space open, Esc closes. The items are Menu's. Like a system menu bar, a click does not
     take the focus, and closing gives it back to where it was (the editor), so Copy or Paste act there. -->
<script lang="ts">
  import { barKey, stepMenu, type MenuBarMenu } from "../logic/menuBarModel";
  import Menu from "./Menu.svelte";

  interface Props {
    menus: MenuBarMenu[];
    label?: string;
    surface?: "panel" | "none";
  }

  let { menus, label = "Menu bar", surface = "panel" }: Props = $props();

  let bar = $state<HTMLDivElement | null>(null);
  let buttons = $state<HTMLButtonElement[]>([]);
  let returnFocus: HTMLElement | null = null;
  let open = $state<{ index: number; keyboard: boolean } | null>(null);
  let focused = $state(0);
  // The menu that was open when its own name was pressed: Menu closes it on the press, the click must not reopen it.
  let pressedOpen = -1;

  const shown = $derived(open && open.index < menus.length ? open : null);

  function show(index: number, keyboard: boolean): void {
    if (!open) {
      const active = document.activeElement;
      returnFocus = active instanceof HTMLElement && !bar?.contains(active) ? active : null;
    }
    open = { index, keyboard };
    focused = index;
  }

  function close(restoreFocus: boolean): void {
    open = null;
    if (restoreFocus) {
      (returnFocus?.isConnected ? returnFocus : buttons[focused])?.focus();
    }
  }

  function onclick(index: number, event: MouseEvent): void {
    if (pressedOpen === index || open?.index === index) {
      pressedOpen = -1;
      close(true);
      return;
    }
    // A keyboard click (Enter or Space) has detail 0: highlight the first item so arrows work at once.
    show(index, event.detail === 0);
  }

  function onkeydown(index: number, event: KeyboardEvent): void {
    const key = barKey(event.key);
    if (!key) {
      return;
    }
    event.preventDefault();
    if ("open" in key) {
      show(index, true);
      return;
    }
    const next = "move" in key ? stepMenu(menus.length, index, key.move) : "first" in key ? 0 : menus.length - 1;
    focused = next;
    buttons[next]?.focus();
  }

  function menuPlace(index: number): { x: number; y: number } {
    const rect = buttons[index]?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 2 };
  }
</script>

<div bind:this={bar} class="menu-bar" class:bare={surface === "none"} role="menubar" aria-label={label}>
  {#each menus as menu, index (index)}
    <button
      bind:this={buttons[index]}
      type="button"
      class="name"
      class:open={shown?.index === index}
      class:strong={menu.strong}
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={shown?.index === index}
      tabindex={index === focused ? 0 : -1}
      onpointerdown={() => (pressedOpen = open?.index === index ? index : -1)}
      onmousedown={(event) => event.preventDefault()}
      onclick={(event) => onclick(index, event)}
      onmouseenter={() => {
        if (open && open.index !== index) {
          show(index, false);
        }
      }}
      onkeydown={(event) => onkeydown(index, event)}
    >
      {menu.label}
    </button>
  {/each}
</div>

{#if shown}
  {#key shown.index}
    {@const place = menuPlace(shown.index)}
    <Menu
      items={menus[shown.index].items}
      x={place.x}
      y={place.y}
      keyboard={shown.keyboard}
      label={menus[shown.index].label}
      onclose={close}
      onstep={(step) => show(stepMenu(menus.length, shown.index, step), true)}
    />
  {/key}
{/if}

<style>
  .menu-bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--menu-bar-gap);
    height: var(--menu-bar-height);
    padding: 0 var(--menu-bar-padding-x);
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }

  /* Inside AppHeader: the header's background and glow show through, and its line is the one under both. */
  .bare {
    background: transparent;
    border-bottom: none;
  }

  .name {
    height: var(--menu-bar-item-height);
    padding: 0 var(--menu-bar-item-padding-x);
    border: none;
    border-radius: var(--menu-bar-item-radius);
    background: transparent;
    color: var(--text);
    font: inherit;
    white-space: nowrap;
    cursor: default;
  }

  .name.strong {
    font-weight: var(--font-weight-bold);
  }

  .name:hover,
  .name:focus-visible {
    background: var(--hover);
    outline: none;
  }

  .name.open {
    background: var(--selected);
  }
</style>
