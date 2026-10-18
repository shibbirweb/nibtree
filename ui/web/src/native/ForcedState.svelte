<!-- Draws its content in a forced interaction state (a scenario node's `state`), for the parity check. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { setForcedState, type InteractionState } from "../lib/logic/forcedState";

  let { state, children }: { state: InteractionState; children: Snippet } = $props();
  setForcedState(() => state);
</script>

{@render children()}
