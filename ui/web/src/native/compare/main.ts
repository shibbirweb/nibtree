// The compare tool's page (ui/web/compare.html), served by `bun run ui:swift:compare`.
import { mount } from "svelte";
import "$ui/styles/tokens.css";
import "$ui/styles/base.css";
import "$ui/styles/code.css";
import ComparePage from "./ComparePage.svelte";

document.documentElement.setAttribute(
  "data-theme",
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
);
mount(ComparePage, { target: document.getElementById("app") as HTMLElement });
