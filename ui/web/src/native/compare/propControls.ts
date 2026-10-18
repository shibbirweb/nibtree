// The compare tool's props panel: each documented prop of a component (docs/*.ts, checked against its $props())
// as the control that edits it in a scenario. Snippets, callbacks and elements have no control: a scenario gives
// them as slots or not at all.
import type { PropDoc } from "../../lib/docs/types";
import { icons } from "../../lib/icons";
import { scales, textStyles } from "../../lib/styles/tokens";

export type ChoiceValue = string | boolean;

export type PropControl =
  | {
      kind: "choice";
      name: string;
      values: ChoiceValue[];
      nullable: boolean;
      fallback: ChoiceValue | null;
      /** The component needs a value (Icon's name): no "default" choice. */
      required: boolean;
    }
  | { kind: "flag"; name: string; fallback: boolean }
  | { kind: "number"; name: string; fallback: number | null }
  | { kind: "text"; name: string; fallback: string }
  | { kind: "json"; name: string; fallback: string };

/** Named types the docs use, with their values. */
export const NAMED_TYPES: Record<string, string[]> = {
  IconName: Object.keys(icons),
  IconSize: Object.keys(scales.iconSize),
  TextStyleName: Object.keys(textStyles),
};

/** The parts of a union at the top level: `"a" | "b" | null` is three. */
function unionParts(type: string): string[] {
  return type.split("|").map((part) => part.trim());
}

function parseDefault(code: string | undefined): unknown {
  if (code === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(code);
  } catch {
    return code;
  }
}

/** The control for a prop, or null when a scenario cannot set it (snippets, callbacks, elements, generics). */
export function propControl(doc: PropDoc): PropControl | null {
  const parts = unionParts(doc.type);
  const fallback = parseDefault(doc.default);
  const nullable = parts.includes("null");
  const rest = parts.filter((part) => part !== "null");
  const literals = rest.every((part) => /^".*"$/.test(part) || part === "boolean" || part in NAMED_TYPES);
  if (rest.length === 1 && rest[0] === "boolean") {
    return { kind: "flag", name: doc.name, fallback: fallback === true };
  }
  if (rest.length > 0 && literals) {
    const values = rest.flatMap((part): ChoiceValue[] => {
      if (part === "boolean") {
        return [false, true];
      }
      return part in NAMED_TYPES ? NAMED_TYPES[part] : [part.slice(1, -1)];
    });
    const start = typeof fallback === "string" || typeof fallback === "boolean" ? fallback : null;
    return { kind: "choice", name: doc.name, values, nullable, fallback: start, required: doc.required === true };
  }
  if (rest.length === 1 && rest[0] === "number") {
    return { kind: "number", name: doc.name, fallback: typeof fallback === "number" ? fallback : null };
  }
  if (rest.length === 1 && rest[0] === "string") {
    return { kind: "text", name: doc.name, fallback: typeof fallback === "string" ? fallback : "" };
  }
  if (/^\{.*\}$/.test(doc.type)) {
    return { kind: "json", name: doc.name, fallback: doc.default ?? "{}" };
  }
  return null;
}

/** Every prop of a component a scenario can set, in the doc's order. */
export function propControls(props: PropDoc[]): PropControl[] {
  return props.map(propControl).filter((control): control is PropControl => control !== null);
}
