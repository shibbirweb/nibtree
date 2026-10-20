<!-- A band set into an editor under a line, like VS Code's peek: a header with a title, a quieter detail and buttons
     at the end, the content below at a set height, and a line above and below in the tone of what it shows. Escape
     inside it calls `onclose`. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { presetVar, type ViewHeight } from "../logic/presets";

  interface Props {
    label: string;
    title: string;
    /** Quieter text after the title, such as "2 of 4 changes". */
    detail?: string | null;
    tone?: "added" | "modified" | "deleted" | "neutral";
    height?: Exclude<ViewHeight, "fill">;
    actions?: Snippet;
    onclose?: () => void;
    children: Snippet;
  }

  let { label, title, detail = null, tone = "neutral", height = "large", actions, onclose, children }: Props = $props();

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && onclose && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="peek {tone}" aria-label={label} style:height={presetVar("viewHeight", height)} onkeydown={keydown}>
  <header class="head">
    <span class="title">{title}</span>
    {#if detail}
      <span class="detail">{detail}</span>
    {/if}
    <span class="spacer"></span>
    {@render actions?.()}
  </header>
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .peek {
    --peek-edge: var(--border-strong);
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-top: 1px solid var(--peek-edge);
    border-bottom: 1px solid var(--peek-edge);
    background: var(--editor-bg);
  }

  .added {
    --peek-edge: var(--diff-added-edge);
  }

  .modified {
    --peek-edge: var(--diff-modified-edge);
  }

  .deleted {
    --peek-edge: var(--danger);
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--peek-panel-gap);
    height: var(--peek-panel-header-height);
    padding: 0 var(--peek-panel-padding-x);
    border-bottom: 1px solid var(--peek-edge);
    background: var(--panel-alt);
    font-size: var(--font-size-compact);
  }

  .title {
    color: var(--text);
    white-space: nowrap;
  }

  .detail {
    min-width: 0;
    overflow: hidden;
    color: var(--text-dim);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .body {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
