// The web half of the native parity check (ui/swift/scripts/parity.ts): draws one scenario of ui/swift/parity for a
// screenshot, or times drawing many copies of it. `?scenario=<id>&theme=light|dark`.
import { mount, tick, unmount } from "svelte";
import "$ui/styles/tokens.css";
import "$ui/styles/base.css";
import "$ui/styles/code.css";
import NativePage from "./NativePage.svelte";
import BenchList from "./BenchList.svelte";
import { scenarioById } from "./scenarios";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") === "dark" ? "dark" : "light");
const scenario = scenarioById(params.get("scenario") ?? "");
mount(NativePage, { target: document.getElementById("app") as HTMLElement, props: { scenario } });

/** Milliseconds to mount `count` copies of the scenario and get them laid out and painted. */
async function bench(count: number): Promise<number> {
  if (!scenario) {
    return -1;
  }
  const target = document.createElement("div");
  document.body.append(target);
  const start = performance.now();
  const list = mount(BenchList, {
    target,
    props: { node: scenario.node, width: scenario.width, height: scenario.height, count },
  });
  await tick();
  target.getBoundingClientRect();
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const elapsed = performance.now() - start;
  unmount(list);
  target.remove();
  return elapsed;
}

Object.assign(window, { nativeBench: bench });
