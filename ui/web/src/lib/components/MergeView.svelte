<!-- The 3-way merge view: your version, the result and their version side by side, chunks tinted by kind
     (modified, added, deleted, conflict) through the text and the line numbers, ribbons joining them across the
     gaps. Each side's numbers face the result, with its chunks' Apply and Ignore buttons beside them. The result is
     editable; scrolling one pane scrolls the others. The app computes the chunks and applies them. -->
<script lang="ts">
  import { syntaxHighlighting } from "@codemirror/language";
  import { EditorState, type Extension } from "@codemirror/state";
  import { EditorView, lineNumbers } from "@codemirror/view";
  import { classHighlighter } from "@lezer/highlight";
  import { onDestroy } from "svelte";
  import { chunkDecorations, gutterChunksOf, setChunks, type ChunkSide } from "../editor/chunks";
  import { paneGutters, setGutterChunks, type ChunkActions } from "../editor/mergeGutters";
  import { mergeGutterTheme } from "../editor/mergeGutterTheme";
  import { languageSupport, type CodeLanguage } from "../editor/languages";
  import { editorTheme, mergeTheme } from "../editor/theme";
  import type { MergeChunk } from "../logic/mergeGeometry";
  import type { ViewHeight } from "../logic/presets";
  import type { ConnectorRibbon } from "./MergeConnector.svelte";
  import MergeFrame, { type MergeFrameParts } from "./MergeFrame.svelte";

  interface Props {
    left: string;
    result?: string;
    right: string;
    chunks: MergeChunk[];
    labels?: { left: string; result: string; right: string };
    fileName?: string;
    language?: CodeLanguage;
    height?: ViewHeight;
    label: string;
    extensions?: Extension[];
    onapply?: (index: number, side: "left" | "right") => void;
    onignore?: (index: number, side: "left" | "right") => void;
  }

  let {
    left,
    result = $bindable(""),
    right,
    chunks,
    labels = { left: "Yours", result: "Result", right: "Theirs" },
    fileName = "",
    language = "plain",
    height = "fill",
    label,
    extensions = [],
    onapply,
    onignore,
  }: Props = $props();

  const views: Partial<Record<ChunkSide, EditorView>> = {};
  let panesEl: HTMLDivElement | null = null;
  let leftRibbons = $state<ConnectorRibbon[]>([]);
  let rightRibbons = $state<ConnectorRibbon[]>([]);
  let syncing = false;

  /** The top and bottom of lines [start, end) of a pane, relative to the panes. */
  function span(side: ChunkSide, [start, end]: [number, number]): [number, number] {
    const view = views[side];
    if (!view || !panesEl) {
      return [0, 0];
    }
    const base = panesEl.getBoundingClientRect().top;
    const doc = view.state.doc;
    const top = (line: number) => {
      const clamped = Math.min(Math.max(line, 0), doc.lines - 1);
      const block = view.lineBlockAt(doc.line(clamped + 1).from);
      const edge = line >= doc.lines ? block.bottom : block.top;
      return edge + view.documentTop - base;
    };
    return [top(start), end > start ? top(end - 1) + view.defaultLineHeight : top(start)];
  }

  function measure(): void {
    leftRibbons = chunks.map((chunk, index) => {
      const [aTop, aBottom] = span("left", chunk.left);
      const [bTop, bBottom] = span("result", chunk.result);
      return { index, kind: chunk.kind, aTop, aBottom, bTop, bBottom };
    });
    rightRibbons = chunks.map((chunk, index) => {
      const [aTop, aBottom] = span("result", chunk.result);
      const [bTop, bBottom] = span("right", chunk.right);
      return { index, kind: chunk.kind, aTop, aBottom, bTop, bBottom };
    });
  }

  function syncScroll(from: ChunkSide): void {
    if (syncing) {
      return;
    }
    syncing = true;
    const top = views[from]?.scrollDOM.scrollTop ?? 0;
    for (const side of ["left", "result", "right"] as const) {
      if (side !== from && views[side]) {
        views[side].scrollDOM.scrollTop = top;
      }
    }
    syncing = false;
    requestAnimationFrame(measure);
  }

  /** A side's gutters: numbers next to the result, and its chunks' Apply and Ignore beside them. */
  function sideGutters(side: "left" | "right"): Extension {
    const actions: ChunkActions | null =
      onapply || onignore
        ? {
            apply: onapply ? (index) => onapply(index, side) : undefined,
            ignore: onignore ? (index) => onignore(index, side) : undefined,
            toward: side === "left" ? "right" : "left",
            applyTitle: () => `Apply ${side} change`,
            ignoreTitle: `Ignore ${side} change`,
          }
        : null;
    return paneGutters(side === "left" ? "after" : "before", actions, false);
  }

  /** The chunk effects for a pane: its tints, and for a side its gutter buttons. */
  function chunkEffects(side: ChunkSide, next: MergeChunk[]) {
    return side === "result"
      ? [setChunks.of(next)]
      : [setChunks.of(next), setGutterChunks.of(gutterChunksOf(next, side))];
  }

  /** The frame's panes are in the page: an editor goes into each. */
  async function build(parts: MergeFrameParts): Promise<void> {
    panesEl = parts.panes;
    const support = await languageSupport(language);
    for (const side of ["left", "result", "right"] as const) {
      const host = parts[side];
      if (views[side]) {
        continue;
      }
      views[side] = new EditorView({
        parent: host,
        doc: side === "left" ? left : side === "right" ? right : result,
        extensions: [
          side === "result" ? lineNumbers() : sideGutters(side),
          syntaxHighlighting(classHighlighter),
          editorTheme,
          mergeTheme,
          mergeGutterTheme,
          support,
          chunkDecorations(side, chunks),
          side === "result" ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)],
          EditorView.contentAttributes.of({ "aria-label": `${label}: ${labels[side]}` }),
          EditorView.updateListener.of((update) => {
            if (side === "result" && update.docChanged) {
              result = update.state.doc.toString();
            }
            if (update.geometryChanged || update.docChanged) {
              requestAnimationFrame(measure);
            }
          }),
          ...extensions,
        ],
      });
      views[side].scrollDOM.addEventListener("scroll", () => syncScroll(side));
      if (side !== "result") {
        views[side].dispatch({ effects: setGutterChunks.of(gutterChunksOf(chunks, side)) });
      }
    }
    requestAnimationFrame(measure);
  }

  $effect(() => {
    const next = chunks;
    for (const side of ["left", "result", "right"] as const) {
      views[side]?.dispatch({ effects: chunkEffects(side, next) });
    }
    requestAnimationFrame(measure);
  });

  onDestroy(() => Object.values(views).forEach((view) => view?.destroy()));
</script>

<MergeFrame {label} {labels} {fileName} {height} {leftRibbons} {rightRibbons} onready={(parts) => void build(parts)} />
