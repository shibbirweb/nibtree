<!-- One theme's comparison: web | Swift | diff (pixels off by more than the tolerance in magenta) at real size, with
     the parity gate's numbers: the match within a device pixel and at the same spot, both needing 99%. -->
<script lang="ts">
  import Stack from "../../lib/components/Stack.svelte";
  import Text from "../../lib/components/Text.svelte";
  import type { ThemeResult } from "./compareApi";

  let { result, width }: { result: ThemeResult; width: number } = $props();

  const passes = $derived(!result.error && result.sameSize && result.match >= 0.99 && result.strict >= 0.99);
  const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
  let shown = $state(0);
</script>

<Stack gap="xs">
  <Stack direction="row" gap="md" align="center">
    <Text variant="title">{result.theme === "light" ? "Light" : "Dark"}</Text>
    <Text tone={passes ? "success" : "danger"} weight="semibold">{passes ? "Matches" : "Differs"}</Text>
    <Text tone="dim" tabular>match {percent(result.match)}, same spot {percent(result.strict)}</Text>
    {#if !result.sameSize}<Text tone="danger">Sizes differ</Text>{/if}
  </Stack>
  <div class="labels" style:width="{width * 3}px">
    <Text variant="caption" tone="dim">Web (WebKit)</Text>
    <Text variant="caption" tone="dim">Swift (SwiftUI)</Text>
    <Text variant="caption" tone="dim">Differences</Text>
  </div>
  {#if result.error}<Text tone="danger">{result.error}</Text>{/if}
  <img
    hidden={!result.sideBySide}
    src="data:image/png;base64,{result.sideBySide}"
    alt="Web, Swift and the differences, {result.theme} theme"
    width={shown || undefined}
    onload={(event) => (shown = (event.currentTarget as HTMLImageElement).naturalWidth / 2)}
  />
</Stack>

<style>
  .labels {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  img {
    display: block;
    max-width: none;
  }
</style>
