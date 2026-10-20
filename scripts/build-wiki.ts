#!/usr/bin/env bun
/**
 * Checks docs/wiki and turns it into GitHub wiki pages.
 *
 * A GitHub wiki is a separate git repository (`<repo>.wiki.git`) with a flat
 * list of pages, so nothing in docs/wiki reaches it by being merged. The wiki
 * workflow (.github/workflows/wiki.yml) runs this and pushes the result.
 *
 *     bun scripts/build-wiki.ts --check        only check (CI runs this on every push and pull request)
 *     bun scripts/build-wiki.ts <out-dir>      check, then write the wiki repository's files
 *
 * docs/wiki/features.json is the map. The check fails when a listed page is
 * missing or a page is not listed, a feature has no usage page, developer
 * chapter or screenshots, a usage page leaves out one of its screenshots, an
 * image is unused, a link points nowhere, or a page breaks the style rules
 * (title line, no em-dash, at most MAX_WORDS words, valid mermaid blocks).
 *
 * A screenshot not taken yet is written as `[TODO:name.png]` in its usage page, where the
 * image will go. The check accepts it in place of the image and lists every one still to
 * take, so they are easy to find; a marker for an image that exists is a problem.
 *
 * On the way out, `# Title` lines are dropped (the wiki prints the page name),
 * links between pages become wiki links, images go to images/, links to other
 * repository files become GitHub URLs, and Home, _Sidebar and _Footer are
 * generated from the manifest.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPOSITORY } from "../src/lib/update/releases";
import {
  findLinks,
  isExternal,
  type Manifest,
  manifestProblems,
  pageName,
  pageProblems,
  resolvePath,
  rewriteLinks,
  screenshotTodos,
  stripTitle,
  WIKI_DIR,
} from "./wiki";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIKI = join(ROOT, WIKI_DIR);
/** The wiki is published from master, so its links to source files point there too. */
const BLOB = `https://github.com/${REPOSITORY}/blob/master`;
const GENERATED_NOTE = `<!-- Generated from ${WIKI_DIR} in ${REPOSITORY}. Do not edit it in the wiki: the next publish overwrites it. -->`;

const read = (path: string) => readFileSync(path, "utf8");

function listFiles(dir: string, extension: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

function loadManifest(): Manifest {
  return JSON.parse(read(join(WIKI, "features.json"))) as Manifest;
}

/** Every page in the manifest, as paths relative to docs/wiki, in sidebar order. */
function allPages(manifest: Manifest): string[] {
  return [
    ...manifest.usage.map((entry) => entry.page),
    ...manifest.developer.map((entry) => entry.page),
    ...manifest.features.map((feature) => feature.developer),
  ];
}

interface CheckResult {
  problems: string[];
  /** Screenshots marked `[TODO:name.png]` and not taken yet, as "feature: image". */
  pending: string[];
}

function check(manifest: Manifest): CheckResult {
  const problems = manifestProblems(manifest);
  const pending: string[] = [];
  const pages = allPages(manifest);
  const listed = new Set(pages);

  for (const folder of ["usage", "developer"]) {
    for (const name of listFiles(join(WIKI, folder), ".md")) {
      if (!listed.has(`${folder}/${name}`)) {
        problems.push(`${WIKI_DIR}/${folder}/${name} is not listed in features.json`);
      }
    }
  }

  const imagesUsed = new Set<string>();
  const texts = new Map<string, string>();
  for (const page of pages) {
    const source = `${WIKI_DIR}/${page}`;
    if (!existsSync(join(ROOT, source))) {
      problems.push(`${source} is listed in features.json but does not exist`);
      continue;
    }
    const text = read(join(ROOT, source));
    texts.set(page, text);
    for (const problem of pageProblems(text)) {
      problems.push(`${source} ${problem}`);
    }
    for (const link of findLinks(text)) {
      if (isExternal(link.target)) {
        continue;
      }
      const resolved = resolvePath(source, link.target);
      if (!existsSync(join(ROOT, resolved))) {
        problems.push(`${source} links to ${link.target}, which does not exist`);
        continue;
      }
      if (resolved.startsWith(`${WIKI_DIR}/images/`)) {
        imagesUsed.add(resolved.slice(`${WIKI_DIR}/images/`.length));
      } else if (
        resolved.startsWith(`${WIKI_DIR}/`) &&
        resolved.endsWith(".md") &&
        !listed.has(resolved.slice(WIKI_DIR.length + 1))
      ) {
        problems.push(`${source} links to ${link.target}, which is not a page in features.json`);
      }
    }
  }

  const screenshots = new Set(manifest.features.flatMap((feature) => feature.screenshots));
  for (const [page, text] of texts) {
    for (const screenshot of screenshotTodos(text)) {
      if (existsSync(join(WIKI, "images", screenshot))) {
        problems.push(`${WIKI_DIR}/${page} still has [TODO:${screenshot}]; show the image instead`);
      } else if (!screenshots.has(screenshot)) {
        problems.push(
          `${WIKI_DIR}/${page} has [TODO:${screenshot}], which is not a screenshot of any feature in features.json`,
        );
      }
    }
  }

  for (const feature of manifest.features) {
    const usageText = texts.get(feature.usage) ?? "";
    const todos = screenshotTodos(usageText);
    for (const screenshot of feature.screenshots) {
      if (!existsSync(join(WIKI, "images", screenshot))) {
        if (todos.includes(screenshot)) {
          pending.push(
            `${feature.id}: images/${screenshot} (bun scripts/screenshots.ts ${screenshot.replace(/\.png$/, "")})`,
          );
        } else {
          problems.push(
            `feature ${feature.id}: screenshot images/${screenshot} does not exist (bun scripts/screenshots.ts ${screenshot.replace(/\.png$/, "")}, or write [TODO:${screenshot}] in ${feature.usage} for now)`,
          );
        }
      } else if (!findLinks(usageText).some((link) => link.target.endsWith(`images/${screenshot}`))) {
        problems.push(`feature ${feature.id}: ${feature.usage} does not show its screenshot images/${screenshot}`);
      }
    }
  }

  for (const image of listFiles(join(WIKI, "images"), ".png")) {
    if (!imagesUsed.has(image)) {
      problems.push(`${WIKI_DIR}/images/${image} is not used by any page`);
    }
  }
  return { problems, pending };
}

function title(page: string): string {
  return pageName(page).replaceAll("-", " ");
}

function home(manifest: Manifest): string {
  const chapters = manifest.features.map((feature) => `- **[${feature.title}](${pageName(feature.developer)})**`);
  return [
    GENERATED_NOTE,
    "",
    "Nibtree is a native Git client for macOS, Windows and Linux with a friendly three pane merge tool, workspaces, tabs, blame and history.",
    "",
    "## Using Nibtree",
    "",
    ...manifest.usage.map((entry) => `- **[${title(entry.page)}](${pageName(entry.page)})**: ${entry.summary}`),
    "",
    "## Working on Nibtree",
    "",
    ...manifest.developer.map((entry) => `- **[${title(entry.page)}](${pageName(entry.page)})**: ${entry.summary}`),
    "",
    "### How each feature works",
    "",
    "One chapter per feature: why it exists, how it works, the decisions behind it and the bugs we fixed.",
    "",
    ...chapters,
    "",
    "## Elsewhere",
    "",
    `- [Download the latest release](https://github.com/${REPOSITORY}/releases/latest)`,
    `- [Source code](https://github.com/${REPOSITORY})`,
    `- [Report a bug or request a feature](https://github.com/${REPOSITORY}/issues/new/choose)`,
    "",
  ].join("\n");
}

function sidebar(manifest: Manifest): string {
  return [
    GENERATED_NOTE,
    "",
    "**[Home](Home)**",
    "",
    "**Using Nibtree**",
    "",
    ...manifest.usage.map((entry) => `- [${title(entry.page)}](${pageName(entry.page)})`),
    "",
    "**Developers**",
    "",
    ...manifest.developer.map((entry) => `- [${title(entry.page)}](${pageName(entry.page)})`),
    "",
    "**How features work**",
    "",
    ...manifest.features.map((feature) => `- [${feature.title}](${pageName(feature.developer)})`),
    "",
  ].join("\n");
}

function footer(): string {
  return `These pages are generated from [\`${WIKI_DIR}\`](${BLOB}/${WIKI_DIR}). To correct something, open a pull request against the source file; edits made here are overwritten.\n`;
}

function build(manifest: Manifest, outDir: string): void {
  // The output is mirrored into the wiki, so stale pages from an earlier build must not linger.
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    console.error(`${outDir} is not empty; give an empty or new folder so old pages do not linger`);
    process.exit(1);
  }
  mkdirSync(join(outDir, "images"), { recursive: true });
  for (const page of allPages(manifest)) {
    const source = `${WIKI_DIR}/${page}`;
    const body = rewriteLinks(stripTitle(read(join(ROOT, source))), source, BLOB).trim();
    writeFileSync(join(outDir, `${pageName(page)}.md`), `${GENERATED_NOTE}\n\n${body}\n`, "utf8");
  }
  for (const image of listFiles(join(WIKI, "images"), ".png")) {
    copyFileSync(join(WIKI, "images", image), join(outDir, "images", image));
  }
  writeFileSync(join(outDir, "Home.md"), home(manifest), "utf8");
  writeFileSync(join(outDir, "_Sidebar.md"), sidebar(manifest), "utf8");
  writeFileSync(join(outDir, "_Footer.md"), footer(), "utf8");
}

const [argument] = process.argv.slice(2);
if (!argument || process.argv.length > 3) {
  console.error("Usage: bun scripts/build-wiki.ts --check | <out-dir>");
  process.exit(2);
}
const manifest = loadManifest();
const { problems, pending } = check(manifest);
if (problems.length > 0) {
  console.error(`docs/wiki has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
const pages = allPages(manifest).length;
const imageBytes = listFiles(join(WIKI, "images"), ".png").reduce(
  (sum, image) => sum + statSync(join(WIKI, "images", image)).size,
  0,
);
if (argument !== "--check") {
  build(manifest, argument);
  console.log(`wrote ${pages} pages, Home, _Sidebar and _Footer to ${argument}`);
}
console.log(
  `docs/wiki is fine: ${pages} pages, ${manifest.features.length} features, ${(imageBytes / 1024 / 1024).toFixed(1)} MB of screenshots`,
);
if (pending.length > 0) {
  console.log(
    `\n${pending.length} screenshot${pending.length === 1 ? "" : "s"} still to take ([TODO:...] in the pages):\n`,
  );
  for (const screenshot of pending) {
    console.log(`  ${screenshot}`);
  }
}
