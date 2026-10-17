<script lang="ts">
  import { EditorView, lineNumbers } from "@codemirror/view";
  import AppShell from "$ui/components/AppShell.svelte";
  import type { MergeFrameParts } from "$ui/components/MergeFrame.svelte";
  import MergeStackFrame from "$ui/components/MergeStackFrame.svelte";
  import Text from "$ui/components/Text.svelte";
  import { chunkLenses, type LensItem } from "$ui/editor/chunkLens";
  import { editorTheme } from "$ui/editor/theme";

  const texts = {
    left: "const port = 3000;\nstart(port);\n",
    result: "const port = 8080;\nstart(port);\n",
    right: "const port = 8080;\nstart(port);\nlog('ready');\n",
  };
  let last = $state("Press a lens link");

  function lens(side: string): LensItem[] {
    return [
      {
        line: 0,
        kind: "conflict",
        actions: [
          { label: "Accept", run: () => (last = `Accept ${side}`) },
          { label: "Accept both", run: () => (last = "Accept both") },
          { label: "Ignore", run: () => (last = `Ignore ${side}`) },
        ],
      },
    ];
  }

  // The app builds its own editors into the panes; here plain ones, with a lens above the first change.
  function build(parts: MergeFrameParts): () => void {
    const views = [
      new EditorView({
        parent: parts.left,
        doc: texts.left,
        extensions: [lineNumbers(), editorTheme, chunkLenses(() => lens("yours"))],
      }),
      new EditorView({
        parent: parts.result,
        doc: texts.result,
        extensions: [
          lineNumbers(),
          editorTheme,
          chunkLenses(() => [{ line: 0, kind: "conflict", note: "No changes accepted", actions: [] }]),
        ],
      }),
      new EditorView({
        parent: parts.right,
        doc: texts.right,
        extensions: [lineNumbers(), editorTheme, chunkLenses(() => lens("theirs"))],
      }),
    ];
    return () => views.forEach((view) => view.destroy());
  }
</script>

<Text tone="dim">{last}</Text>
<AppShell height="large">
  {#snippet editor()}
    <MergeStackFrame
      label="Merge server.ts"
      labels={{ left: "Yours: main", result: "Result", right: "Theirs: feature" }}
      fileName="server.ts"
      onready={build}
    >
      {#snippet resultEnd()}<Text size="small" tone="danger">1 conflict</Text>{/snippet}
    </MergeStackFrame>
  {/snippet}
</AppShell>
