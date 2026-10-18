<!-- One prop of the selected node: a choice, a switch, a number, a text or a JSON object. "Default" removes the prop,
     so the component's own default applies on both sides (null is never sent: Swift's scenarios have no null). -->
<script lang="ts">
  import type { PropValue } from "../../../../swift/scripts/parity/scenario";
  import Input from "../../lib/components/Input.svelte";
  import Select from "../../lib/components/Select.svelte";
  import Stack from "../../lib/components/Stack.svelte";
  import Switch from "../../lib/components/Switch.svelte";
  import Tag from "../../lib/components/Tag.svelte";
  import Text from "../../lib/components/Text.svelte";
  import type { ChoiceValue, PropControl } from "./propControls";

  interface Props {
    control: PropControl;
    value: PropValue | undefined;
    /** The Swift twin has no such prop yet: the web draws it, Swift does not. */
    webOnly: boolean;
    onchange: (value: PropValue | undefined) => void;
  }

  let { control, value, webOnly, onchange }: Props = $props();

  const UNSET = "__default";

  function encode(choice: ChoiceValue): string {
    return typeof choice === "boolean" ? `__${choice}` : choice;
  }

  function decode(text: string): PropValue | undefined {
    if (text === UNSET) {
      return undefined;
    }
    if (text === "__true" || text === "__false") {
      return text === "__true";
    }
    return text;
  }

  const choiceOptions = $derived.by(() => {
    if (control.kind !== "choice") {
      return [];
    }
    const shown = control.fallback === null ? "none" : String(control.fallback);
    return [
      ...(control.required ? [] : [{ value: UNSET, label: `default (${shown})` }]),
      ...control.values.map((choice) => ({ value: encode(choice), label: String(choice) })),
    ];
  });

  const chosen = $derived(
    value === undefined || typeof value === "object"
      ? UNSET
      : typeof value === "boolean"
        ? `__${value}`
        : String(value),
  );

  function onNumber(event: Event) {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    const number = Number(text);
    onchange(text === "" || Number.isNaN(number) ? undefined : number);
  }

  let jsonInvalid = $state(false);

  function onJson(event: Event) {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    if (text === "") {
      jsonInvalid = false;
      onchange(undefined);
      return;
    }
    try {
      onchange(JSON.parse(text) as PropValue);
      jsonInvalid = false;
    } catch {
      jsonInvalid = true;
    }
  }
</script>

<Stack gap="xxs">
  <Stack direction="row" gap="xs" align="center">
    <Text variant="label" mono>{control.name}</Text>
    {#if webOnly}<Tag size="small" tone="warning">web only</Tag>{/if}
  </Stack>
  {#if control.kind === "choice"}
    <Select
      label={control.name}
      size="small"
      width="fill"
      options={choiceOptions}
      value={chosen}
      onchange={(next) => onchange(decode(next))}
    />
  {:else if control.kind === "flag"}
    <Switch
      label={control.name}
      checked={typeof value === "boolean" ? value : control.fallback}
      onchange={(checked) => onchange(checked)}
    />
  {:else if control.kind === "number"}
    <Input
      type="number"
      width="fill"
      value={typeof value === "number" ? String(value) : ""}
      placeholder={control.fallback === null ? "none" : String(control.fallback)}
      aria-label={control.name}
      onchange={onNumber}
    />
  {:else if control.kind === "text"}
    <Input
      width="fill"
      value={typeof value === "string" ? value : ""}
      placeholder={control.fallback || "empty"}
      aria-label={control.name}
      oninput={(event) => onchange((event.currentTarget as HTMLInputElement).value || undefined)}
    />
  {:else}
    <Input
      mono
      width="fill"
      invalid={jsonInvalid}
      value={value === undefined ? "" : JSON.stringify(value)}
      placeholder={control.fallback}
      aria-label={control.name}
      onchange={onJson}
    />
  {/if}
</Stack>
