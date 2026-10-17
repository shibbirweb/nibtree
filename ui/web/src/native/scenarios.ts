import type { Scenario } from "../../../swift/scripts/parity/scenario";

const files = import.meta.glob<Scenario[]>("../../../swift/parity/*.json", { eager: true, import: "default" });

export const scenarios: Scenario[] = Object.values(files).flat();

export function scenarioById(id: string): Scenario | null {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}
