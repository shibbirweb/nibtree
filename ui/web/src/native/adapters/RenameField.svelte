<!-- A RenameField in a parity scenario: it needs an `onrename`, which a scenario's JSON cannot hold, so it gets one
     that does nothing. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import RenameField from "../../lib/components/RenameField.svelte";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof RenameField>);
</script>

<RenameField {...given} onrename={() => {}} />
