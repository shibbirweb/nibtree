import type { Scenario } from "../../../swift/scripts/parity/scenario";

const files = import.meta.glob<Scenario[]>("../../../swift/parity/*.json", { eager: true, import: "default" });

export const scenarios: Scenario[] = Object.values(files).flat();

export function scenarioById(id: string): Scenario | null {
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}

/** A scenario passed as JSON (the compare tool's unsaved one), or null when it is not one. */
export function scenarioFromData(data: string): Scenario | null {
  try {
    const parsed = JSON.parse(data) as Partial<Scenario> | null;
    if (typeof parsed?.id !== "string" || typeof parsed.width !== "number" || typeof parsed.node !== "object") {
      return null;
    }
    return parsed as Scenario;
  } catch {
    return null;
  }
}
