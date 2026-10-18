// The compare page's calls to its server (ui/swift/scripts/compare.ts): every answer is JSON, and an error answer
// carries `{ error }`, thrown here as an Error with that message.
import type { Scenario } from "../../../../swift/scripts/parity/scenario";
import type { ThemeResult, Timing } from "../../../../swift/scripts/parity/compareSession";

export type { ThemeResult, Timing };

async function call<T>(route: string, payload: unknown = {}): Promise<T> {
  const response = await fetch(`/api${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const answer = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(answer.error ?? `${route} failed (${response.status})`);
  }
  return answer;
}

export function loadInfo(): Promise<{ swiftProps: Record<string, string[]> }> {
  return call("/info");
}

export function compareScenario(scenario: Scenario): Promise<ThemeResult[]> {
  return call("/compare", { scenario });
}

/** Several scenarios at once, such as one prop's values: results in the same order. */
export function compareScenarios(scenarios: Scenario[]): Promise<ThemeResult[][]> {
  return call("/compare-many", { scenarios });
}

export function measureScenario(scenario: Scenario, count: number): Promise<Timing> {
  return call("/measure", { scenario, count });
}

/** Shows the scenario in the native window (opening it if closed); `front` brings the window forward. */
export function showLive(scenario: Scenario, front = false): Promise<{ ok: boolean }> {
  return call("/live", { scenario, front });
}

export function rebuildSwift(): Promise<{ ok: boolean }> {
  return call("/rebuild");
}

export function saveScenario(component: string, scenario: Scenario): Promise<{ file: string }> {
  return call("/save", { component, scenario });
}
