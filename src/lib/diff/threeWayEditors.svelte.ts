// The three read-only editors of a 3-pane diff in the library's MergeFrame: a merge commit's parents and result, or
// HEAD, index and work tree. The middle is the hub: scrolling any pane maps its center line to the others.
import { EditorState, type Extension, Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { ConnectorRibbon } from "@nibtree/ui/components/MergeConnector.svelte";
import type { MergeFrameParts } from "@nibtree/ui/components/MergeFrame.svelte";
import { changeMarkField } from "$lib/editor/scrollMarkers";
import { baseExtensions, editorLanguage } from "$lib/editor/setup";
import { type LineMark, sideExtensions } from "$lib/merge/extensions";
import { markEffects, type PaneActions, paneChrome } from "./threeWayGutters";
import { lineAtCenter, scrollToLine } from "$lib/merge/mergeScroll";
import { type Anchor, invertAnchors, mapLine } from "$lib/merge/model";
import type { FileDiff, LineRange, LineSelection } from "$lib/types";
import { newLineOnScreen } from "./diffPositions";
import { foldStep, inlineFolds } from "./foldField";
import type { FoldEdge } from "./foldModel";
import { fallbackHunks } from "./inlineDoc";
import { bands } from "./threeWayBands";
import { paneBlame, startBlame, type ThreeWayBlame, type ThreeWayPane as Pane } from "./threeWayBlame";
import { diffTheme, toneColors } from "./mergeExtensions";
import {
  changeSelection,
  changeSummary,
  parentAnchors,
  parentFold,
  paneTones,
  parentMarks,
  type ParentSide,
  resultFolds,
  resultMarks,
  takeChange,
  threeWayChanges,
  type ThreeWayChange,
  type ThreeWayOptions,
} from "./threeWay";

export interface ThreeWayBuild {
  parts: MergeFrameParts;
  /** The left pane (original) against the middle (modified). */
  left: FileDiff;
  /** The right pane (original) against the middle (modified). */
  right: FileDiff;
  path: string;
  /** Folds the runs of lines that match both sides. */
  collapse: boolean;
  options?: ThreeWayOptions;
  /** The middle pane's scroll position to start at, after a rebuild (staging a change rebuilds the view). */
  scrollTop?: number | null;
  blame?: ThreeWayBlame | null;
  actions?: PaneActions;
}

export class ThreeWayEditors {
  leftRibbons = $state.raw<ConnectorRibbon[]>([]);
  rightRibbons = $state.raw<ConnectorRibbon[]>([]);
  /** "15 changes, 1 conflict". */
  summary = $state("");
  changeCount = $state(0);
  current = $state(-1);
  /** The blamed pane, for the Blame button's display. */
  blameView: EditorView | null = null;

  #views: Record<Pane, EditorView> | null = null;
  #changes: Record<ParentSide, ThreeWayChange[]> = { left: [], right: [] };
  #marks: LineMark[] = [];
  #anchors: Record<ParentSide, Anchor[]> = { left: [], right: [] };
  #panes: HTMLElement | null = null;
  #lock: Pane | null = null;
  #unlockFrame = 0;
  #drawFrame = 0;
  /** A build or destroy started later makes an earlier build stop after its await. */
  #token = 0;
  /** Set while a fold step is copied to the other panes, so they do not copy it back. */
  #mirroring = false;
  #texts: Record<Pane, string> = { left: "", result: "", right: "" };

  async build(request: ThreeWayBuild): Promise<void> {
    const token = ++this.#token;
    const language = await editorLanguage(request.path);
    if (token !== this.#token) {
      return;
    }
    const { parts, left, right } = request;
    this.#panes = parts.panes;
    const navigation = keymap.of([
      { key: "F7", run: () => this.goToChange(1) },
      { key: "Shift-F7", run: () => this.goToChange(-1) },
    ]);
    const geometry = EditorView.updateListener.of((update) => {
      if (update.geometryChanged || update.viewportChanged || update.heightChanged) {
        this.scheduleDraw();
      }
    });
    const texts: Record<Pane, Text> = {
      left: Text.of(left.original.split("\n")),
      result: Text.of(left.modified.split("\n")),
      right: Text.of(right.original.split("\n")),
    };
    const leftHunks = left.hunks ?? fallbackHunks(left.original, left.modified);
    const rightHunks = right.hunks ?? fallbackHunks(right.original, right.modified);
    this.#changes = threeWayChanges(leftHunks, rightHunks, request.options);
    this.#marks = resultMarks(this.#changes, request.options?.conflicts ?? true, paneTones(request.options));
    this.#texts = { left: left.original, result: left.modified, right: right.original };
    this.#anchors = {
      left: parentAnchors(this.#changes.left, texts.left.lines, texts.result.lines),
      right: parentAnchors(this.#changes.right, texts.right.lines, texts.result.lines),
    };
    const marksOf: Record<Pane, LineMark[]> = {
      left: parentMarks(this.#changes.left, texts.left, texts.result, paneTones(request.options).left),
      result: this.#marks,
      right: parentMarks(this.#changes.right, texts.right, texts.result, paneTones(request.options).right),
    };
    const folds = request.collapse ? resultFolds(this.#marks, texts.result.lines) : [];
    const foldsOf = (name: Pane) =>
      request.collapse
        ? inlineFolds(name === "result" ? folds : folds.map((fold) => parentFold(fold, this.#anchors[name])))
        : [];
    const pane = (name: Pane, parent: HTMLElement) =>
      new EditorView({
        parent,
        state: EditorState.create({
          doc: texts[name],
          extensions: [
            baseExtensions({ readOnly: true, kind: "merge", lineNumbers: false }),
            language,
            sideExtensions(),
            [diffTheme, toneColors],
            changeMarkField,
            paneChrome(name, request.actions ?? {}),
            navigation,
            geometry,
            foldsOf(name),
            paneBlame(name, request.blame ?? null),
            this.#mirrorFolds(name),
            EditorView.editable.of(false),
          ],
        }),
      });
    this.#views = {
      left: pane("left", parts.left),
      result: pane("result", parts.result),
      right: pane("right", parts.right),
    };
    for (const name of ["left", "result", "right"] as const) {
      const view = this.#views[name];
      view.dispatch({ effects: markEffects(name, marksOf[name]) });
      view.scrollDOM.addEventListener("scroll", () => this.#follow(name), { passive: true });
    }
    this.blameView = startBlame(this.#views, request.blame ?? null, left, right);
    this.summary = changeSummary(this.#marks);
    this.changeCount = this.#marks.length;
    const scrollTop = request.scrollTop ?? null;
    requestAnimationFrame(() => {
      if (scrollTop !== null && this.#views) {
        this.#views.result.scrollDOM.scrollTop = scrollTop;
        this.scheduleDraw();
      } else if (!this.goToChange(1)) {
        this.scheduleDraw();
      }
    });
  }

  /** A fold opened a step in one pane opens the same lines in the others. */
  #mirrorFolds(source: Pane): Extension {
    return EditorView.updateListener.of((update) => {
      const steps = update.transactions.flatMap((tr) =>
        tr.effects.filter((effect) => effect.is(foldStep)).map((effect) => effect.value),
      );
      if (this.#mirroring || steps.length === 0) {
        return;
      }
      const lines = steps.map((step) => ({ line: update.state.doc.lineAt(step.pos).number - 1, edge: step.edge }));
      // An update listener must not dispatch while its update runs.
      queueMicrotask(() => this.#applyFoldSteps(source, lines));
    });
  }

  #applyFoldSteps(source: Pane, steps: { line: number; edge: FoldEdge }[]): void {
    const views = this.#views;
    if (!views) {
      return;
    }
    this.#mirroring = true;
    try {
      for (const target of ["left", "result", "right"] as const) {
        if (target === source) {
          continue;
        }
        const doc = views[target].state.doc;
        const effects = steps.map(({ line, edge }) => {
          const resultLine = source === "result" ? line : mapLine(line, this.#anchors[source]);
          const targetLine =
            target === "result" ? resultLine : mapLine(resultLine, invertAnchors(this.#anchors[target]));
          const number = Math.max(1, Math.min(doc.lines, Math.round(targetLine) + 1));
          return foldStep.of({ pos: doc.line(number).from, edge });
        });
        views[target].dispatch({ effects });
      }
    } finally {
      this.#mirroring = false;
    }
  }

  #follow(source: Pane): void {
    const views = this.#views;
    if (!views) {
      return;
    }
    if (this.#lock && this.#lock !== source) {
      this.scheduleDraw();
      return;
    }
    this.#lock = source;
    cancelAnimationFrame(this.#unlockFrame);
    const position = lineAtCenter(views[source]);
    const resultLine = source === "result" ? position : mapLine(position, this.#anchors[source]);
    if (source !== "result") {
      scrollToLine(views.result, resultLine);
    }
    for (const side of ["left", "right"] as const) {
      if (side !== source) {
        scrollToLine(views[side], mapLine(resultLine, invertAnchors(this.#anchors[side])));
      }
    }
    this.#unlockFrame = requestAnimationFrame(() => {
      this.#unlockFrame = requestAnimationFrame(() => {
        this.#lock = null;
      });
    });
    this.scheduleDraw();
  }

  scheduleDraw(): void {
    cancelAnimationFrame(this.#drawFrame);
    this.#drawFrame = requestAnimationFrame(() => {
      const views = this.#views;
      if (!views || !this.#panes) {
        return;
      }
      const box = this.#panes.getBoundingClientRect();
      const parent = (view: EditorView) => ({ view, range: (change: ThreeWayChange) => change.parent });
      const result = { view: views.result, range: (change: ThreeWayChange) => change.result };
      this.leftRibbons = bands(this.#changes.left, parent(views.left), result, box);
      this.rightRibbons = bands(this.#changes.right, result, parent(views.right), box);
    });
  }

  /** Steps to the next or previous change of the result, wrapping around; false when there is none. */
  goToChange(direction: 1 | -1): boolean {
    const views = this.#views;
    const count = this.#marks.length;
    if (!views || count === 0) {
      return false;
    }
    this.current = this.current < 0 ? (direction > 0 ? 0 : count - 1) : (this.current + direction + count) % count;
    const doc = views.result.state.doc;
    const line = Math.min(this.#marks[this.current].range.start + 1, doc.lines);
    const position = doc.line(line).from;
    views.result.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: "center" }),
    });
    // The result's scroll event brings the parents along.
    this.scheduleDraw();
    return true;
  }

  /** Change `index` of `side`: the middle with it taken in (stage, unstage) and its lines (Revert, Apply). */
  change(side: ParentSide, index: number): { taken: string; lines: LineSelection } | null {
    const change = this.#changes[side][index];
    const texts = this.#texts;
    return change ? { taken: takeChange(texts.result, texts[side], change), lines: changeSelection(change) } : null;
  }

  /** The 0-based line of `pane` at its cursor, or at its top when the cursor is out of sight (for Open File). */
  lineOnScreen(pane: Pane): number | null {
    const view = this.#views?.[pane];
    return view ? newLineOnScreen(view, null) : null;
  }

  /** The middle pane's scroll position, kept across a rebuild. */
  scrollTop(): number | null {
    return this.#views?.result.scrollDOM.scrollTop ?? null;
  }

  destroy(): void {
    this.#token++;
    cancelAnimationFrame(this.#unlockFrame);
    cancelAnimationFrame(this.#drawFrame);
    if (this.#views) {
      for (const view of Object.values(this.#views)) {
        view.destroy();
      }
    }
    this.#views = this.blameView = null;
    this.leftRibbons = [];
    this.rightRibbons = [];
    this.current = -1;
  }
}
