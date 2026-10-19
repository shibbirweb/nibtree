<!-- FileRow in a parity scenario: the scenario's icon name turned into the view the app's resolver would pass
     (parity/fileIconViews.ts), and its actions given a `run` that does nothing. -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import FileRow from "../../lib/components/FileRow.svelte";
  import { fileIconView } from "../parity/fileIconViews";
  import type { ComponentProps } from "svelte";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as unknown as ComponentProps<typeof FileRow>);
  const icon = $derived(fileIconView((node.props?.icon ?? null) as never));
  const actions = $derived((given.actions ?? []).map((action) => ({ ...action, run: () => {} })));
</script>

<FileRow {...given} {icon} {actions} />
