<script lang="ts">
  import DiffView from "$ui/components/DiffView.svelte";
  import Segmented from "$ui/components/Segmented.svelte";

  const original = 'const port = 3000;\nconst host = "localhost";\n\nstart(host, port);\n';
  const modified =
    'const port = Number(env.PORT ?? 3000);\nconst host = "0.0.0.0";\n\nstart(host, port);\nlog("ready");\n';
  let layout = $state<"split" | "aligned" | "inline">("split");
</script>

<Segmented
  label="Layout"
  bind:value={layout}
  options={[
    { value: "split", label: "Side by side" },
    { value: "aligned", label: "Aligned" },
    { value: "inline", label: "Inline" },
  ]}
/>
{#key layout}
  <DiffView
    label="server.ts"
    {original}
    {modified}
    {layout}
    language="ts"
    height="medium"
    sideLabels={{ original: "HEAD", modified: "Working tree" }}
  />
{/key}
