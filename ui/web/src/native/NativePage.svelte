<!-- The scenario at its width on the theme's panel color, marked ready once fonts are loaded. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Scenario } from "../../../swift/scripts/parity/scenario";
  import ScenarioNode from "./ScenarioNode.svelte";

  let { scenario }: { scenario: Scenario | null } = $props();
  let ready = $state(false);

  onMount(() => {
    void document.fonts.ready.then(() => (ready = true));
  });
</script>

{#if scenario}
  <div
    id="frame"
    class="frame"
    style:width="{scenario.width}px"
    style:height={scenario.height ? `${scenario.height}px` : null}
    data-ready={ready || undefined}
  >
    <ScenarioNode node={scenario.node} />
  </div>
{:else}
  <p>Unknown scenario.</p>
{/if}

<style>
  /* A column like Stack, which holds almost every component in the app: its children are flex items, so a Text's
     span lays out as a block with its own line box (no strut from this frame's font). */
  /* Playwright shoots an element rounded up to whole CSS pixels; the sliver below the frame shows the page, which
     has the frame's color so it does not count as a difference. The Swift side pads its picture the same way. */
  :global(body) {
    background: var(--panel);
  }

  .frame {
    display: flex;
    flex-direction: column;
    background: var(--panel);
  }
</style>
