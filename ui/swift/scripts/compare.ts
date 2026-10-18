// The compare tool (`bun run ui:swift:compare`): a page that shows a component from ui/web and its Swift twin side by
// side with the same props, how much they match (the parity gate's numbers) and which draws faster. Edit the props,
// see both again, and save the case as a parity scenario. A native window shows the same scenario live in SwiftUI.
// Open http://localhost:1433/compare.html.
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin } from "vite";
import { swiftComponents } from "./coverage";
import { CompareSession } from "./parity/compareSession";
import { harnessProps } from "./parity/props";
import type { Scenario } from "./parity/scenario";

const PORT = 1433;
const swiftRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(swiftRoot, "../web");
const base = `http://localhost:${PORT}/`;
const session = new CompareSession(swiftRoot, base);

/** The props the Swift side draws for each component (what the harness reads), so the page can mark the web
 *  props its twin does not have yet. */
function swiftPropNames(): Record<string, string[]> {
  const harness = readFileSync(join(swiftRoot, "Sources/NibtreeShowcase/Parity/ScenarioView.swift"), "utf8");
  const names: Record<string, string[]> = {};
  for (const component of swiftComponents()) {
    names[component] = harnessProps(component, harness);
  }
  return names;
}

async function body<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function reply(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

const routes: Record<string, (request: IncomingMessage) => Promise<unknown>> = {
  "/info": async () => ({ swiftProps: swiftPropNames() }),
  "/compare": async (request) => session.compare((await body<{ scenario: Scenario }>(request)).scenario),
  "/compare-many": async (request) => {
    const { scenarios } = await body<{ scenarios: Scenario[] }>(request);
    return session.compareMany(scenarios.slice(0, 200));
  },
  "/measure": async (request) => {
    const { scenario, count } = await body<{ scenario: Scenario; count?: number }>(request);
    return session.measure(scenario, Math.min(Math.max(Math.round(count ?? 200), 1), 2000));
  },
  "/live": async (request) => {
    const { scenario, front } = await body<{ scenario: Scenario; front?: boolean }>(request);
    session.showLive(scenario, front === true);
    return { ok: true };
  },
  "/rebuild": async () => {
    await session.rebuild();
    return { ok: true };
  },
  "/save": async (request) => {
    const { component, scenario } = await body<{ component: string; scenario: Scenario }>(request);
    return { file: await session.save(component, scenario) };
  },
};

const api: Plugin = {
  name: "nibtree-compare-api",
  configureServer(server) {
    server.middlewares.use("/api", (request, response) => {
      const route = routes[(request.url ?? "").split("?")[0]];
      if (!route) {
        reply(response, 404, { error: "No such route" });
        return;
      }
      route(request).then(
        (value) => reply(response, 200, value),
        (error: unknown) => reply(response, 500, { error: error instanceof Error ? error.message : String(error) }),
      );
    });
  },
};

await session.start();
const server = await createServer({
  configFile: join(webRoot, "vite.config.ts"),
  server: { port: PORT, strictPort: true },
  plugins: [api],
  logLevel: "warn",
});
await server.listen();
console.log(`Compare web and Swift components at ${base}compare.html (Ctrl+C stops it)`);

process.on("SIGINT", () => {
  void Promise.all([session.stop(), server.close()]).then(() => process.exit(0));
});
