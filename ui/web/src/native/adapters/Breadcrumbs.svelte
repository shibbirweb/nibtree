<!-- Breadcrumbs in a parity scenario: each crumb's `fileIcon` turned into the view the app's resolver would pass
     (parity/fileIconViews.ts); `fileIcon: null` stays the plain file icon. A floating or anchored bar is
     `position: fixed`; a transformed box over the frame holds it, so it sits in the frame, not the browser window. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Breadcrumbs from "../../lib/components/Breadcrumbs.svelte";
  import { fileIconView } from "../parity/fileIconViews";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
  const crumbs = $derived(
    ((given.crumbs ?? []) as Record<string, never>[]).map((crumb) =>
      crumb.fileIcon === undefined ? crumb : { ...crumb, fileIcon: fileIconView(crumb.fileIcon) },
    ) as never,
  );
</script>

{#if given.variant === "floating" || given.variant === "anchored"}
  <div class="window"><Breadcrumbs {...given} {crumbs} /></div>
{:else}
  <Breadcrumbs {...given} {crumbs} />
{/if}

<style>
  .window {
    position: absolute;
    inset: 0;
    transform: translate(0);
  }
</style>
