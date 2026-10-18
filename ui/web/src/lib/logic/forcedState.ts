// A component shown in an interaction state without the pointer or the keyboard: hovered, pressed, focused or being
// dragged. The parity scenarios and the compare tool set it (`state` on a scenario node) so both libraries draw
// the state the same way; components list the states they draw in their doc (`states`).
import { getContext, setContext } from "svelte";

export const INTERACTION_STATES = ["hover", "pressed", "focus", "dragging"] as const;

export type InteractionState = (typeof INTERACTION_STATES)[number];

const KEY = Symbol("nibtree-forced-state");

export function isInteractionState(value: unknown): value is InteractionState {
  return typeof value === "string" && (INTERACTION_STATES as readonly string[]).includes(value);
}

/** Makes every component below draw `state()`; call it while a component is set up. */
export function setForcedState(state: () => InteractionState | null): void {
  setContext(KEY, state);
}

/** The state forced on this component, if any; call it while the component is set up. */
export function useForcedState(): () => InteractionState | null {
  return getContext<(() => InteractionState | null) | undefined>(KEY) ?? (() => null);
}
