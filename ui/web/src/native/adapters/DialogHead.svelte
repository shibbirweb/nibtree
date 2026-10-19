<!-- DialogHead in a parity scenario. A scenario's JSON cannot hold a function, so `closable: true` stands for an
     `onclose`, which draws the close button. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import DialogHead from "../../lib/components/DialogHead.svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
  const { closable, ...rest } = $derived(given);
</script>

<DialogHead {...rest} title={given.title} onclose={closable ? () => {} : undefined} />
