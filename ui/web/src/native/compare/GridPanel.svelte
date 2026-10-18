<!-- "All values": the selected node drawn once per value of each of its props and once per state, web | Swift |
     differences in light and dark for every cell, with the gate's match. One prop is drawn at a time, so the grid
     fills in as it goes; changing the scenario stops it. -->
<script lang="ts">
  import type { Scenario } from "../../../../swift/scripts/parity/scenario";
  import Button from "../../lib/components/Button.svelte";
  import Notice from "../../lib/components/Notice.svelte";
  import Stack from "../../lib/components/Stack.svelte";
  import Text from "../../lib/components/Text.svelte";
  import { componentDocs } from "../../lib/docs";
  import * as api from "./compareApi";
  import { propControls } from "./propControls";
  import { nodeAt, type NodePath } from "./scenarioEdit";
  import { valueGrid, type GridGroup } from "./valueGrid";

  let { scenario, path }: { scenario: Scenario; path: NodePath } = $props();

  const node = $derived(nodeAt(scenario.node, path) ?? scenario.node);
  const doc = $derived(componentDocs.find((one) => one.name === node.component));
  let groups = $state.raw<GridGroup[]>([]);
  let results = $state.raw<Record<string, api.ThemeResult[]>>({});
  let progress = $state("");
  let error = $state("");
  let run = 0;

  const passes = (cell: api.ThemeResult[]) =>
    cell.every((one) => !one.error && one.sameSize && one.match >= 0.99 && one.strict >= 0.99);
  const worst = (cell: api.ThemeResult[]) => Math.min(...cell.map((one) => one.strict));
  const cells = $derived(groups.flatMap((group) => group.cells));
  const done = $derived(cells.filter((cell) => results[cell.scenario.id]));
  const matching = $derived(done.filter((cell) => passes(results[cell.scenario.id])).length);

  async function draw() {
    const ticket = ++run;
    groups = valueGrid(scenario, path, propControls(doc?.props ?? []), doc?.states ?? []);
    results = {};
    error = "";
    for (const [index, group] of groups.entries()) {
      progress = `Drawing ${group.name} (${index + 1} of ${groups.length})`;
      try {
        const answer = await api.compareScenarios(group.cells.map((cell) => cell.scenario));
        if (ticket !== run) {
          return;
        }
        results = {
          ...results,
          ...Object.fromEntries(group.cells.map((cell, at) => [cell.scenario.id, answer[at]])),
        };
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure);
        break;
      }
    }
    progress = "";
  }

  // A changed scenario or node makes the grid stale: stop drawing and wait for the button.
  $effect(() => {
    void scenario;
    void path;
    run += 1;
    groups = [];
    results = {};
    progress = "";
  });
</script>

<Stack gap="lg">
  <Stack direction="row" gap="md" align="center">
    <Button size="small" variant="primary" disabled={progress !== ""} onclick={draw}>
      Draw all values of {node.component}
    </Button>
    {#if progress}<Text tone="dim">{progress}</Text>{/if}
    {#if done.length > 0}
      <Text tone={matching === done.length ? "success" : "danger"} tabular>
        {matching} of {done.length} cells match{cells.length > done.length ? `, ${cells.length} in all` : ""}
      </Text>
    {/if}
  </Stack>
  {#if error}<Notice tone="danger">{error}</Notice>{/if}
  {#each groups as group (group.name)}
    <Stack gap="sm">
      <Text variant="title" mono>{group.name}</Text>
      <div class="cells">
        {#each group.cells as cell (cell.scenario.id)}
          {@const result = results[cell.scenario.id]}
          <Stack gap="xxs">
            <Stack direction="row" gap="sm" align="center">
              <Text variant="label" mono>{cell.label}</Text>
              {#if result}
                <Text variant="caption" tone={passes(result) ? "success" : "danger"} tabular>
                  {(worst(result) * 100).toFixed(2)}%
                </Text>
              {:else}
                <Text variant="caption" tone="faint">waiting</Text>
              {/if}
            </Stack>
            {#each result ?? [] as theme (theme.theme)}
              {#if theme.error}
                <Text variant="caption" tone="danger">{theme.theme}: {theme.error}</Text>
              {:else}
                <img
                  src="data:image/png;base64,{theme.sideBySide}"
                  alt="{cell.label}: web, Swift and the differences, {theme.theme}"
                  width={scenario.width * 1.5}
                />
              {/if}
            {/each}
          </Stack>
        {/each}
      </div>
    </Stack>
  {/each}
</Stack>

<style>
  /* Cells side by side as room allows; each picture at half size (web, Swift and differences in a row). */
  .cells {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
  }

  img {
    display: block;
    max-width: none;
  }
</style>
