<!-- A ChoiceList in a parity scenario: it needs an `onpick`, which a scenario's JSON cannot hold, so it gets one that
     does nothing. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import ChoiceList from "../../lib/components/ChoiceList.svelte";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof ChoiceList<string>>);
</script>

<ChoiceList {...given} onpick={() => {}} />
