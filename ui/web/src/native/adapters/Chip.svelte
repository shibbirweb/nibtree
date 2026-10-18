<!-- Chip in a parity scenario. A scenario's JSON cannot hold a function, so `pressable: true` stands for an `onclick`,
     which makes the chip a button (and a badge one that lights up under the pointer). -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import Chip from "../../lib/components/Chip.svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
  const { pressable, ...rest } = $derived(given);
</script>

<Chip {...rest} text={given.text} onclick={pressable ? () => {} : undefined} />
