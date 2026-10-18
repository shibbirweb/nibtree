<!-- FileIcon in a parity scenario: the scenario's icon name turned into the view the app's resolver would pass
     (parity/fileIconViews.ts). -->
<script lang="ts">
  import type { ScenarioNode as NodeData } from "../../../../swift/scripts/parity/scenario";
  import FileIcon from "../../lib/components/FileIcon.svelte";
  import { fileIconView } from "../parity/fileIconViews";

  let { node }: { node: NodeData } = $props();
  const given = $derived((node.props ?? {}) as Record<string, never>);
</script>

<FileIcon {...given} view={fileIconView(given.view)} />
