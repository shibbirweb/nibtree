<!-- The compare page's left side: the scenario's tree (pick a node), that node's props and text, the scenario's size,
     its JSON for bigger changes (add a child, a slot), and saving it as a parity scenario. -->
<script lang="ts">
  import type { PropValue, Scenario } from "../../../../swift/scripts/parity/scenario";
  import Button from "../../lib/components/Button.svelte";
  import Input from "../../lib/components/Input.svelte";
  import Row from "../../lib/components/Row.svelte";
  import Stack from "../../lib/components/Stack.svelte";
  import Text from "../../lib/components/Text.svelte";
  import TextArea from "../../lib/components/TextArea.svelte";
  import { componentDocs } from "../../lib/docs";
  import PropField from "./PropField.svelte";
  import { propControls } from "./propControls";
  import Select from "../../lib/components/Select.svelte";
  import { isInteractionState } from "../../lib/logic/forcedState";
  import { nodeAt, treeRows, updateNode, withProp, withState, type NodePath } from "./scenarioEdit";

  interface Props {
    scenario: Scenario;
    path: NodePath;
    swiftProps: Record<string, string[]>;
    saving: boolean;
    onchange: (scenario: Scenario) => void;
    onselect: (path: NodePath) => void;
    onsave: () => void;
  }

  let { scenario, path, swiftProps, saving, onchange, onselect, onsave }: Props = $props();

  const rows = $derived(treeRows(scenario.node));
  const node = $derived(nodeAt(scenario.node, path) ?? scenario.node);
  const doc = $derived(componentDocs.find((one) => one.name === node.component));
  const controls = $derived(propControls(doc?.props ?? []));
  const states = $derived(doc?.states ?? []);
  const known = $derived(new Set(swiftProps[node.component] ?? []));
  const sameStep = (a: NodePath, b: NodePath) =>
    a.length === b.length && a.every((one, index) => one.slot === b[index].slot && one.index === b[index].index);

  function setProp(name: string, value: PropValue | undefined) {
    onchange(updateNode(scenario, path, (current) => withProp(current, name, value)));
  }

  function setText(text: string) {
    onchange(updateNode(scenario, path, (current) => ({ ...current, text })));
  }

  function setSize(key: "width" | "height", text: string) {
    const number = Math.round(Number(text));
    if (key === "height" && (text.trim() === "" || number <= 0)) {
      const { height: _height, ...rest } = scenario;
      onchange(rest);
      return;
    }
    if (Number.isFinite(number) && number > 0) {
      onchange({ ...scenario, [key]: number });
    }
  }

  let json = $state("");
  let jsonInvalid = $state(false);
  $effect(() => {
    json = JSON.stringify(scenario, null, 2);
    jsonInvalid = false;
  });

  function applyJson() {
    try {
      const parsed = JSON.parse(json) as Scenario;
      if (typeof parsed.id !== "string" || typeof parsed.width !== "number" || typeof parsed.node !== "object") {
        throw new Error("not a scenario");
      }
      jsonInvalid = false;
      onselect([]);
      onchange(parsed);
    } catch {
      jsonInvalid = true;
    }
  }
</script>

<Stack gap="lg">
  <Stack direction="row" gap="sm" align="end">
    <Stack gap="xxs" grow>
      <Text variant="label">Scenario id</Text>
      <Input
        width="fill"
        mono
        value={scenario.id}
        aria-label="Scenario id"
        onchange={(event) => onchange({ ...scenario, id: (event.currentTarget as HTMLInputElement).value.trim() })}
      />
    </Stack>
    <Stack gap="xxs">
      <Text variant="label">Width</Text>
      <Input
        type="number"
        width="xsmall"
        value={String(scenario.width)}
        aria-label="Width"
        onchange={(event) => setSize("width", (event.currentTarget as HTMLInputElement).value)}
      />
    </Stack>
    <Stack gap="xxs">
      <Text variant="label">Height</Text>
      <Input
        type="number"
        width="xsmall"
        value={scenario.height ? String(scenario.height) : ""}
        placeholder="auto"
        aria-label="Height"
        onchange={(event) => setSize("height", (event.currentTarget as HTMLInputElement).value)}
      />
    </Stack>
  </Stack>

  <Stack gap="xxs">
    <Text variant="sectionLabel">Nodes</Text>
    {#each rows as row (JSON.stringify(row.path))}
      <Row size="tree" depth={row.depth} selected={sameStep(row.path, path)} onclick={() => onselect(row.path)}>
        <Text mono truncate>{row.label}</Text>
      </Row>
    {/each}
  </Stack>

  <Stack gap="md">
    <Text variant="sectionLabel">{node.component} props</Text>
    {#if node.text !== undefined || node.component === "Text"}
      <Stack gap="xxs">
        <Text variant="label" mono>text</Text>
        <Input
          width="fill"
          value={node.text ?? ""}
          aria-label="Text"
          oninput={(event) => setText((event.currentTarget as HTMLInputElement).value)}
        />
      </Stack>
    {/if}
    {#if states.length > 0}
      <Stack gap="xxs">
        <Text variant="label" mono>state</Text>
        <Select
          label="state"
          size="small"
          width="fill"
          options={[{ value: "none", label: "none" }, ...states.map((state) => ({ value: state, label: state }))]}
          value={node.state ?? "none"}
          onchange={(value) =>
            onchange(
              updateNode(scenario, path, (current) =>
                withState(current, isInteractionState(value) ? value : undefined),
              ),
            )}
        />
      </Stack>
    {/if}
    {#each controls as control (control.name)}
      <PropField
        {control}
        value={node.props?.[control.name]}
        webOnly={swiftProps[node.component] !== undefined && !known.has(control.name)}
        onchange={(value) => setProp(control.name, value)}
      />
    {:else}
      <Text tone="dim">No props a scenario can set.</Text>
    {/each}
  </Stack>

  <Stack gap="xs">
    <Text variant="sectionLabel">Scenario JSON</Text>
    <TextArea mono rows="xlarge" bind:value={json} invalid={jsonInvalid} aria-label="Scenario JSON" />
    <Stack direction="row" gap="sm">
      <Button size="small" onclick={applyJson}>Apply JSON</Button>
      <Button size="small" variant="primary" disabled={saving} onclick={onsave}>Save as scenario</Button>
    </Stack>
  </Stack>
</Stack>
