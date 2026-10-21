<!-- A modal dialog over a dimmed window: `message` (a question, like confirms), `form` (the Git dialogs; Cmd+Enter
     submits), `split` (Settings), `panel` (a scrolling body) or `view` (a tall box holding one view, Local History).
     `enterSubmits` lets Enter in a one-line field submit too. Esc and a click on the dim area close it unless
     `dismissible` is false. Focus moves in and back when it closes (logic/dialogFocus.ts). -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconName } from "../icons";
  import { focusInto, strayKeys } from "../logic/dialogFocus";
  import { DIALOG_OVERLAY, URGENT_DIALOG_LAYER, type DialogVariant } from "../logic/dialogLayout";
  import { dismissDialog, runDialogKey } from "../logic/dialogKeys";
  import { DialogMover } from "../logic/dialogMover.svelte";
  import { presetVar, type DialogWidth } from "../logic/presets";
  import DialogHead from "./DialogHead.svelte";

  interface Props {
    open?: boolean;
    title: string;
    variant?: DialogVariant;
    subtitle?: string;
    icon?: IconName | null;
    iconTone?: "accent" | "success" | "warning" | "danger";
    width?: DialogWidth;
    dismissible?: boolean;
    urgent?: boolean;
    /** Drag the title to move it; double-click the title to center it again. */
    movable?: boolean;
    onclose?: () => void | boolean;
    onsubmit?: () => void;
    enterSubmits?: boolean;
    actions?: Snippet;
    footnote?: Snippet;
    toolbar?: Snippet;
    sidebar?: Snippet;
    /** Split: a head over the content, such as the open section's name, with a close button; it moves it too. */
    contentTitle?: string;
    children: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    variant = "message",
    subtitle = "",
    icon = null,
    iconTone = "accent",
    width = variant === "form" ? "normal" : variant === "panel" ? "large" : variant === "view" ? "full" : "small",
    dismissible = true,
    urgent = false,
    movable = false,
    onclose,
    onsubmit,
    enterSubmits = false,
    actions,
    footnote,
    toolbar,
    sidebar,
    contentTitle = "",
    children,
  }: Props = $props();

  const titleId = $props.id();
  let dialogEl = $state<HTMLDivElement | null>(null);

  /** Panel and view dialogs: a head with a close button. */
  const boxed = $derived(variant === "panel" || variant === "view");
  const mover = new DialogMover();
  const grab = () => (movable ? dialogEl : null);
  const dragHint = $derived(movable ? "Drag to move, double-click to center" : undefined);
  function close(): void {
    dismissDialog(onclose, () => (open = false));
  }

  $effect(() => {
    if (open && dialogEl) {
      return focusInto(dialogEl);
    }
  });

  function onkeydown(event: KeyboardEvent): void {
    runDialogKey(event, { dismissible, enterSubmits, urgent }, { close, submit: onsubmit });
  }
</script>

<svelte:window onkeydown={strayKeys(() => (open ? dialogEl : null), onkeydown)} />
{#snippet heading()}
  <h2 id={titleId} class:handle={movable} title={dragHint} use:mover.handle={grab}>{title}</h2>
{/snippet}

{#if open}
  <div
    class="overlay is-{variant}"
    style:z-index={urgent ? URGENT_DIALOG_LAYER : DIALOG_OVERLAY[variant].layer}
    style:padding-top={DIALOG_OVERLAY[variant].top}
    role="presentation"
    onmousedown={(event) => dismissible && event.target === event.currentTarget && close()}
  >
    <div
      bind:this={dialogEl}
      class="dialog is-{variant}"
      class:moving={mover.moving !== null}
      style:transform={mover.transform}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
      style:--dialog-chosen-width={variant === "split" ? null : presetVar("dialogWidth", width)}
      {onkeydown}
    >
      {#if variant === "split"}
        <div class="nav">
          {@render heading()}
          {@render sidebar?.()}
        </div>
        <div class="content">
          {#if contentTitle}
            <div class:handle={movable} title={dragHint} use:mover.handle={grab}>
              <DialogHead title={contentTitle} size="content" onclose={dismissible ? close : undefined} />
            </div>
          {/if}
          {@render children()}
        </div>
      {:else}
        {#if icon || subtitle || boxed}
          <DialogHead
            {title}
            {titleId}
            {subtitle}
            {icon}
            {iconTone}
            size={boxed ? "panel" : "normal"}
            onclose={boxed && dismissible ? close : undefined}
          />
        {:else}
          {@render heading()}
        {/if}
        {@render toolbar?.()}
        <div class="body">{@render children()}</div>
        {#if actions || footnote}
          <div class="actions">
            {#if footnote}<span class="footnote">{@render footnote()}</span>{/if}
            {@render actions?.()}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Layer and top offset per variant: logic/dialogLayout.ts. */
  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: var(--overlay);
  }

  .dialog {
    width: min(var(--dialog-chosen-width), calc(100vw - 2 * var(--space-8)));
    padding: var(--dialog-padding-top) var(--dialog-padding-x) var(--dialog-padding-bottom);
    background: var(--panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--dialog-radius);
    box-shadow: var(--shadow);
    outline: none;
  }

  .dialog.is-form {
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    padding: var(--form-dialog-padding-top) var(--form-dialog-padding-x) var(--form-dialog-padding-bottom);
  }

  .dialog.is-split {
    display: flex;
    width: min(var(--split-dialog-width), calc(100vw - 2 * var(--space-8)));
    height: min(var(--split-dialog-height), 84vh);
    padding: 0;
    overflow: hidden;
    border-radius: var(--split-dialog-radius);
  }

  .handle {
    cursor: grab;
    user-select: none;
  }

  .moving,
  .moving .handle {
    cursor: grabbing;
  }

  .moving {
    box-shadow: var(--shadow-lifted);
  }

  h2 {
    margin: 0 0 var(--dialog-title-gap);
    font-size: var(--text-title-size);
    font-weight: var(--text-title-weight);
  }

  .is-form .body,
  .is-panel .body,
  .is-view .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .is-form .body {
    display: flex;
    flex-direction: column;
    gap: var(--form-dialog-body-gap);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--dialog-actions-gap);
    margin-top: var(--dialog-actions-top);
  }

  .is-form .actions {
    margin-top: var(--form-dialog-actions-top);
  }

  .nav {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: var(--split-dialog-nav-width);
    padding: var(--split-dialog-nav-padding-top) var(--split-dialog-nav-padding-x)
      var(--split-dialog-nav-padding-bottom);
    background: var(--panel-alt);
    border-right: 1px solid var(--border-strong);
  }

  .nav h2 {
    margin: 0 var(--space-4) var(--space-6);
    font-size: var(--text-heading-size);
  }

  .content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .footnote {
    flex: 1;
    min-width: 0;
  }

  /* Panel: a large dialog with a scrolling body between its head (and toolbar) and a footer with a line above. */
  .dialog.is-panel,
  .dialog.is-view {
    display: flex;
    flex-direction: column;
    max-height: 84vh;
    padding: 0;
    border-radius: var(--panel-dialog-radius);
  }

  .is-panel .body {
    padding: var(--panel-dialog-body-padding-top) var(--panel-dialog-body-padding-x)
      var(--panel-dialog-body-padding-bottom);
  }

  /* View: a tall box of a fixed height whose body is one view (a list beside a diff), without padding. */
  .overlay.is-view {
    align-items: center;
  }

  .dialog.is-view {
    height: min(var(--view-dialog-height), calc(100vh - 2 * var(--space-11)));
    max-height: none;
    overflow: hidden;
  }

  .is-view .body {
    display: flex;
    border-top: 1px solid var(--border-strong);
  }

  .is-panel .actions {
    gap: var(--panel-dialog-foot-gap);
    margin: 0;
    padding: var(--panel-dialog-foot-padding-top) var(--panel-dialog-body-padding-x)
      var(--panel-dialog-foot-padding-bottom);
    border-top: 1px solid var(--border-strong);
  }
</style>
