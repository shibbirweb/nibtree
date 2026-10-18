<!-- The compare tool: pick a component with a Swift twin and one of its scenarios (or start one), edit the props, and
     see ui/web and ui/swift draw it side by side in both themes with the parity gate's match numbers. Measure times
     both; Save adds the case to ui/swift/parity so the gate checks it from then on. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Scenario } from "../../../../swift/scripts/parity/scenario";
  import Button from "../../lib/components/Button.svelte";
  import Notice from "../../lib/components/Notice.svelte";
  import Segmented from "../../lib/components/Segmented.svelte";
  import Select from "../../lib/components/Select.svelte";
  import SplitPane from "../../lib/components/SplitPane.svelte";
  import Spinner from "../../lib/components/Spinner.svelte";
  import Stack from "../../lib/components/Stack.svelte";
  import Text from "../../lib/components/Text.svelte";
  import { componentDocs } from "../../lib/docs";
  import ScenarioNode from "../ScenarioNode.svelte";
  import { scenarios } from "../scenarios";
  import * as api from "./compareApi";
  import { propControls } from "./propControls";
  import GridPanel from "./GridPanel.svelte";
  import ResultPanel from "./ResultPanel.svelte";
  import ScenarioPanel from "./ScenarioPanel.svelte";
  import { firstPathOf, newScenario, scenariosUsing, type NodePath } from "./scenarioEdit";

  const NEW = "__new";
  let swiftProps = $state.raw<Record<string, string[]>>({});
  let component = $state("Icon");
  let chosenId = $state("");
  let scenario = $state.raw<Scenario | null>(null);
  let path = $state.raw<NodePath>([]);
  let results = $state.raw<api.ThemeResult[] | null>(null);
  let timing = $state.raw<api.Timing | null>(null);
  let count = $state("200");
  let busy = $state("");
  let error = $state("");
  let message = $state("");
  let panel = $state(360);
  let view = $state<"pair" | "grid">("pair");

  const components = $derived(Object.keys(swiftProps).sort());
  const own = $derived(scenariosUsing(component, scenarios));
  const taken = $derived(new Set(scenarios.map((one) => one.id)));

  onMount(() => {
    api.loadInfo().then(
      (info) => (swiftProps = info.swiftProps),
      (failure: Error) => (error = failure.message),
    );
  });

  function pick(id: string) {
    chosenId = id;
    timing = null;
    message = "";
    if (id === NEW) {
      const doc = componentDocs.find((one) => one.name === component);
      scenario = newScenario(component, propControls(doc?.props ?? []), taken);
    } else {
      scenario = structuredClone(own.find((one) => one.id === id) ?? null);
    }
    path = scenario ? firstPathOf(scenario.node, component) : [];
  }

  $effect(() => {
    if (!own.some((one) => one.id === chosenId) && chosenId !== NEW) {
      pick(own[0]?.id ?? NEW);
    }
  });

  // The native window follows every change at once; it draws in the Swift process, so it costs the page nothing.
  $effect(() => {
    if (scenario) {
      api.showLive(scenario).catch((failure: Error) => (error = failure.message));
    }
  });

  // Every change is compared again shortly after the last edit; an answer to an older scenario is dropped.
  let asked = 0;
  $effect(() => {
    const current = scenario;
    if (!current) {
      return;
    }
    const ticket = ++asked;
    const timer = setTimeout(() => {
      busy = "Comparing";
      api.compareScenario(current).then(
        (answer) => {
          if (ticket === asked) {
            results = answer;
            error = "";
            busy = "";
          }
        },
        (failure: Error) => {
          if (ticket === asked) {
            error = failure.message;
            busy = "";
          }
        },
      );
    }, 400);
    return () => clearTimeout(timer);
  });

  async function act(label: string, work: () => Promise<void>) {
    busy = label;
    error = "";
    try {
      await work();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = "";
    }
  }

  const measure = () =>
    act("Measuring", async () => {
      timing = scenario ? await api.measureScenario(scenario, Number(count)) : null;
    });
  const rebuild = () =>
    act("Building Swift", async () => {
      await api.rebuildSwift();
      scenario = scenario ? { ...scenario } : null;
    });
  const save = () =>
    act("Saving", async () => {
      if (scenario) {
        message = `Saved to ${(await api.saveScenario(component, scenario)).file}`;
      }
    });

  const faster = $derived(timing ? (timing.webMs - timing.swiftMs) / timing.webMs : 0);
</script>

<SplitPane direction="row" bind:size={panel} preset="sidebar" max={640} label="Resize the props panel">
  {#snippet first()}
    <Stack padding="lg" gap="lg" scroll="y" grow surface="panel">
      <Stack gap="xs">
        <Text variant="heading">Compare web and Swift</Text>
        <Select
          label="Component"
          width="fill"
          options={components.map((name) => ({ value: name, label: name }))}
          bind:value={component}
        />
        <Select
          label="Scenario"
          width="fill"
          options={[...own.map((one) => ({ value: one.id, label: one.id })), { value: NEW, label: "New scenario" }]}
          value={chosenId}
          onchange={pick}
        />
      </Stack>
      {#if scenario}
        <ScenarioPanel
          {scenario}
          {path}
          {swiftProps}
          saving={busy !== ""}
          onchange={(next) => (scenario = next)}
          onselect={(next) => (path = next)}
          onsave={save}
        />
      {/if}
    </Stack>
  {/snippet}
  {#snippet second()}
    <Stack padding="lg" gap="xl" scroll="both" grow surface="editor">
      <Segmented
        label="View"
        options={[
          { value: "pair", label: "Side by side" },
          { value: "grid", label: "All values" },
        ]}
        bind:value={view}
      />
      {#if error}<Notice tone="danger">{error}</Notice>{/if}
      {#if message}<Notice tone="success">{message}</Notice>{/if}
      {#if view === "grid"}
        {#if scenario}<GridPanel {scenario} {path} />{/if}
      {:else}
        {@render pair()}
      {/if}
    </Stack>
  {/snippet}
</SplitPane>

{#snippet pair()}
  <Stack direction="row" gap="sm" align="center">
    <Select
      label="Copies to time"
      size="small"
      options={["50", "200", "500", "1000"].map((value) => ({ value, label: `${value} copies` }))}
      bind:value={count}
    />
    <Button size="small" variant="primary" disabled={busy !== "" || !scenario} onclick={measure}>Measure</Button>
    <Button size="small" disabled={busy !== ""} onclick={rebuild}>Rebuild Swift</Button>
    <Button size="small" disabled={!scenario} onclick={() => scenario && void api.showLive(scenario, true)}>
      Native window
    </Button>
    {#if busy}<Spinner size="small" label={busy} /><Text tone="dim">{busy}</Text>{/if}
  </Stack>
  {#if timing}
    <Text tone={faster > 0 ? "success" : "danger"} tabular>
      {timing.count} copies: Swift {timing.swiftMs.toFixed(1)} ms, web {timing.webMs.toFixed(1)} ms. Swift is
      {Math.abs(faster * 100).toFixed(0)}% {faster > 0 ? "faster" : "slower"}.
    </Text>
  {/if}
  {#each results ?? [] as result (result.theme)}
    <ResultPanel {result} width={scenario?.width ?? 0} />
  {/each}
  {#if scenario}
    <Stack gap="xs">
      <Text variant="title">Live web component</Text>
      <Text tone="dim">Drawn by this browser in the page's theme, to try hover and dragging.</Text>
      <div class="live" style:width="{scenario.width}px" style:height={scenario.height ? `${scenario.height}px` : null}>
        <ScenarioNode node={scenario.node} />
      </div>
    </Stack>
  {/if}
{/snippet}

<style>
  /* The split fills the window: it grows in a flex column, like the app's own panes. */
  :global(#app) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .live {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    outline: 1px dashed var(--border);
  }
</style>
