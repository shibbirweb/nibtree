// One doc per component: the showcase page and the generated Markdown (COMPONENTS.md and docs/components/*.md) for
// people and AI agents both come from it. docs.test.ts checks every prop here against the component's $props().

import type { InteractionState } from "../logic/forcedState";

export type ComponentGroup = "Actions" | "Forms" | "Feedback" | "Overlays" | "Navigation" | "Layout" | "Editor";

export interface PropDoc {
  name: string;
  /** TypeScript type as written in the component, e.g. `"default" | "primary"` or `Snippet`. */
  type: string;
  /** Default value as code, e.g. `"default"` or `false`; omitted when the prop is required or has none. */
  default?: string;
  required?: boolean;
  /** `bind:value` works. */
  bindable?: boolean;
  /**
   * The prop carries data (a count, a value, a position, a size the user dragged), not design. Only data props may
   * be numbers; every design choice (size, width, height, color, style) is a named preset.
   */
  data?: boolean;
  description: string;
}

export interface ExampleDoc {
  title: string;
  code: string;
}

export interface ComponentDoc {
  /** Component name and file name: `Button` is `components/Button.svelte`. */
  name: string;
  group: ComponentGroup;
  /** One sentence: what it is. */
  summary: string;
  /** When to use it, and when to use something else. */
  usage: string;
  props: PropDoc[];
  /** Pure logic modules it uses, under `logic/`, shown in the TypeScript tab. */
  logic?: string[];
  examples: ExampleDoc[];
  /** The app markup this component replaces, for moving the app onto the library. */
  replaces: string[];
  /** Interaction states it draws, which scenarios can force (`state`) and the parity gate checks in Swift too. */
  states?: InteractionState[];
  /** Rules an agent must follow, e.g. "Destructive actions confirm first". */
  rules?: string[];
  /** Named like the standard library parts (shadcn/ui) it covers, for search. */
  aliases?: string[];
}

/** A prop row, kept short to write: `prop("size", '"normal" | "small"', "Small is 24px.", { default: '"normal"' })`. */
export function prop(name: string, type: string, description: string, extra: Partial<PropDoc> = {}): PropDoc {
  return { name, type, description, ...extra };
}

/** The `...rest` row of components that pass other attributes to their element. */
export function restProp(element: string, examples: string): PropDoc {
  const tag = element.replace(/^HTML/, "").toLowerCase();
  return prop("...rest", `${element}Attributes`, `Any other ${tag} attribute: ${examples}.`);
}
