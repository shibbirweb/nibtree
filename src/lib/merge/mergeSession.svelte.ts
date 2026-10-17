// The merge tool's editors (MergeEditor.svelte): ours and theirs read-only, the result editable, built into the
// panes of the library's MergeFrame. The chunk state lives in the result editor (chunkField), so undo and redo
// cover applied and ignored changes too; everything on screen is derived from it.
import { isolateHistory, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MergeFrameParts } from "@nibtree/ui/components/MergeFrame.svelte";
import type { ConnectorRibbon } from "@nibtree/ui/components/MergeConnector.svelte";
import { baseExtensions } from "$lib/editor/setup";
import { changeMarkField, setChangeMarks } from "$lib/editor/scrollMarkers";
import type { MergeLayout } from "$lib/stores/settingsData";
import type { MergeDocument } from "$lib/types";
import {
  applyKeymap,
  chunkField,
  resultExtensions,
  setChunks,
  sideExtensions,
  sideMarkEffects,
  sideMarks,
} from "./extensions";
import { InlineSpans } from "./inlineSpans";
import { resultMarkSource, toChangeMarks } from "./mergeMarks";
import { layoutCompartment, moveToLayout, paneLayout } from "./mergeLayout";
import { ribbonsFor } from "./mergeRibbons";
import { type Pane, ScrollSync } from "./mergeScroll";
import {
  acceptWholeSide,
  applyNonConflicting,
  applySide,
  type ChunkAction,
  type ChunkState,
  findUnresolved,
  ignoreSide,
  initialChunks,
  type SideName,
} from "./model";

export class MergeSession {
  chunks = $state.raw<ChunkState[]>([]);
  leftRibbons = $state.raw<ConnectorRibbon[]>([]);
  rightRibbons = $state.raw<ConnectorRibbon[]>([]);
  canUndo = $state(false);
  canRedo = $state(false);

  views: Record<Pane, EditorView> | null = null;
  #panes: HTMLDivElement | null = null;
  #spans: InlineSpans;
  #lastMarkSignature = "";
  #drawPending = false;
  readonly #scroll = new ScrollSync();
  readonly #resultMarkSource = resultMarkSource();

  /** `onSaveKey` runs for Cmd+Enter in an editor. */
  constructor(
    private readonly doc: MergeDocument,
    private readonly onSaveKey: () => void,
  ) {
    this.#spans = new InlineSpans(doc.base);
  }

  /** Builds the editors into the frame's panes and shows the first open change. */
  build(parts: MergeFrameParts, language: Extension, layout: MergeLayout): void {
    if (this.views) {
      return;
    }
    this.#panes = parts.panes;
    const applyKeys = applyKeymap(this.onSaveKey);
    // A side's find bar opening or closing moves its text: redraw the connectors.
    const onSideGeometry = EditorView.updateListener.of((update) => {
      if (update.geometryChanged) {
        this.scheduleDraw();
      }
    });
    const sideView = (text: string, parent: HTMLElement, side: SideName) =>
      new EditorView({
        parent,
        state: EditorState.create({
          doc: text,
          extensions: [
            applyKeys,
            onSideGeometry,
            baseExtensions({ readOnly: true, kind: "merge", lineNumbers: false }),
            language,
            sideExtensions(),
            layoutCompartment.of(paneLayout(side, layout, this, this.#resultMarkSource)),
            changeMarkField,
            EditorView.editable.of(false),
          ],
        }),
      });
    const ours = sideView(this.doc.ours, parts.left, "ours");
    const theirs = sideView(this.doc.theirs, parts.right, "theirs");
    this.#spans.sides = { ours: ours.state.doc, theirs: theirs.state.doc };
    const result = new EditorView({
      parent: parts.result,
      state: EditorState.create({
        doc: this.doc.base,
        extensions: [
          applyKeys,
          baseExtensions({ readOnly: false, kind: "merge" }),
          language,
          resultExtensions(initialChunks(this.doc.chunks)),
          layoutCompartment.of(paneLayout("result", layout, this, this.#resultMarkSource)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(setChunks)))) {
              this.#sync();
            } else if (update.geometryChanged || update.viewportChanged) {
              this.scheduleDraw();
            }
          }),
        ],
      }),
    });
    this.views = { ours, result, theirs };
    for (const [pane, view] of Object.entries(this.views) as [Pane, EditorView][]) {
      view.scrollDOM.addEventListener("scroll", () => this.#onScroll(pane), { passive: true });
    }
    this.#sync();
    const first = findUnresolved(this.chunks, -1, 1);
    if (first) {
      this.#reveal(first);
    } else {
      this.scheduleDraw();
    }
  }

  destroy(): void {
    this.#scroll.dispose();
    if (this.views) {
      this.views.ours.destroy();
      this.views.result.destroy();
      this.views.theirs.destroy();
      this.views = null;
      this.#spans.sides = null;
    }
  }

  /** Pulls the chunk state out of the result editor and refreshes everything derived from it. */
  #sync(): void {
    if (!this.views) {
      return;
    }
    const state = this.views.result.state;
    const chunks = state.field(chunkField);
    this.chunks = chunks;
    this.canUndo = undoDepth(state) > 0;
    this.canRedo = redoDepth(state) > 0;
    // Side decorations only depend on which sides are still open.
    const signature = chunks.map((chunk) => `${chunk.id}${chunk.oursDone ? 1 : 0}${chunk.theirsDone ? 1 : 0}`).join();
    if (signature !== this.#lastMarkSignature) {
      this.#lastMarkSignature = signature;
      for (const side of ["ours", "theirs"] as const) {
        const marks = sideMarks(chunks, side, (chunk) => this.#spans.of(chunk, side));
        this.views[side].dispatch({ effects: [...sideMarkEffects(marks), setChangeMarks.of(toChangeMarks(marks))] });
      }
    }
    this.scheduleDraw();
  }

  scheduleDraw(): void {
    if (this.#drawPending) {
      return;
    }
    this.#drawPending = true;
    requestAnimationFrame(() => {
      this.#drawPending = false;
      this.#draw();
    });
  }

  #draw(): void {
    if (!this.views || !this.#panes) {
      return;
    }
    const rect = this.#panes.getBoundingClientRect();
    const { ours, result, theirs } = this.views;
    this.leftRibbons = ribbonsFor(this.chunks, "ours", { side: ours, result }, rect.top, rect.height);
    this.rightRibbons = ribbonsFor(this.chunks, "theirs", { side: theirs, result }, rect.top, rect.height);
  }

  #onScroll(source: Pane): void {
    this.scheduleDraw();
    if (this.views) {
      this.#scroll.follow(source, this.views, this.chunks);
    }
  }

  #dispatch(action: ChunkAction | null): void {
    if (!this.views || !action) {
      return;
    }
    this.views.result.dispatch({
      changes: action.changes,
      effects: setChunks.of(action.chunks),
      annotations: isolateHistory.of("full"),
      userEvent: "input.merge",
    });
  }

  apply(chunkId: number, side: SideName): void {
    const sides = this.#spans.sides;
    if (this.views && sides) {
      const state = this.views.result.state;
      this.#dispatch(applySide(state.doc, state.field(chunkField), chunkId, side, sides));
    }
  }

  ignore(chunkId: number, side: SideName): void {
    if (this.views) {
      this.#dispatch(ignoreSide(this.views.result.state.field(chunkField), chunkId, side));
    }
  }

  /** Takes both sides of a change, yours first (each its own undo step). */
  acceptBoth(chunkId: number): void {
    this.apply(chunkId, "ours");
    this.apply(chunkId, "theirs");
  }

  /** Moves the editors into another layout's panes; nothing in them changes. */
  relayout(parts: MergeFrameParts, layout: MergeLayout): void {
    if (this.views) {
      this.#panes = parts.panes;
      moveToLayout(this.views, parts, layout, this, this.#resultMarkSource);
      this.#lastMarkSignature = "";
      this.#sync();
    }
  }

  /** Every change no conflict touches, from one side or both. */
  applyNonConflicting(only?: SideName): void {
    const sides = this.#spans.sides;
    if (this.views && sides) {
      const state = this.views.result.state;
      this.#dispatch(applyNonConflicting(state.doc, state.field(chunkField), sides, only));
    }
  }

  /** The whole file from one side. */
  acceptWhole(side: SideName): void {
    if (this.views) {
      const state = this.views.result.state;
      const text = side === "ours" ? this.doc.ours : this.doc.theirs;
      this.#dispatch(acceptWholeSide(state.doc, state.field(chunkField), text, side));
    }
  }

  #reveal(chunk: ChunkState): void {
    if (!this.views) {
      return;
    }
    const text = this.views.result.state.doc;
    const line = text.line(Math.min(chunk.result.start + 1, text.lines));
    this.views.result.dispatch({
      selection: EditorSelection.cursor(line.from),
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    requestAnimationFrame(() => this.#onScroll("result"));
  }

  /** The next (1) or previous (-1) open change from the result's caret (F7, Shift+F7). */
  navigate(direction: 1 | -1): void {
    if (!this.views) {
      return;
    }
    const state = this.views.result.state;
    const cursorLine = state.doc.lineAt(state.selection.main.head).number - 1;
    const target = findUnresolved(this.chunks, cursorLine, direction);
    if (target) {
      this.#reveal(target);
    }
  }

  undo(): void {
    if (this.views) {
      undo(this.views.result);
    }
  }

  redo(): void {
    if (this.views) {
      redo(this.views.result);
    }
  }

  /** The result was edited: closing or reloading would lose it. */
  edited(): boolean {
    return this.views !== null && undoDepth(this.views.result.state) > 0;
  }

  resultText(): string | null {
    return this.views?.result.state.doc.toString() ?? null;
  }

  /** The open chunks as the result editor has them now. */
  currentChunks(): ChunkState[] {
    return this.views ? this.views.result.state.field(chunkField) : this.chunks;
  }
}
