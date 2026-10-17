// The editors of a diff: a MergeView side by side (its sides linked by SplitLink), or one EditorView inline
// (inlineDoc.ts), built into the body of the library's DiffFrame. Keeps the change count and position, the
// selection's changed lines, the connector's bands and the overview ruler; DiffView.svelte draws the toolbar.
import type { MergeView } from "@codemirror/merge";
import type { ChunkActions } from "@nibtree/ui/editor/mergeGutters";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, panels } from "@codemirror/view";
import type { DiffFrameParts } from "@nibtree/ui/components/DiffFrame.svelte";
import type { ConnectorRibbon } from "@nibtree/ui/components/MergeConnector.svelte";
import { type BlameTarget, blameExtension, loadBlame } from "$lib/editor/blame";
import { createStrip, jumpToLine, layoutTicks, renderTicks } from "$lib/editor/scrollMarkers";
import { baseExtensions, editorLanguage } from "$lib/editor/setup";
import { type DiffLayout, settings } from "$lib/stores/settings.svelte";
import type { FileDiff, LineHunk, LineSelection } from "$lib/types";
import { newLineOnScreen, revealChange, revealNewLine, rulerMarks, selectedLines } from "./diffPositions";
import { inlineEditor, splitEditors } from "./diffViews";
import type { InlineDoc } from "./inlineDoc";
import { type DiffSide, selectionSize } from "./lineSelection";
import { chunkKinds, diffTheme, sideColors } from "./mergeExtensions";
import { chunkSelection } from "./revertChange";
import { SplitLink } from "./splitLink";

export type DiffMode = "unstaged" | "staged" | "readonly";

export interface DiffBuild {
  parts: DiffFrameParts;
  diff: FileDiff;
  path: string;
  mode: DiffMode;
  collapse: boolean;
  layout: DiffLayout;
  blame: BlameTarget | null;
  /** The same file in the same layout keeps its scroll position across rebuilds. */
  scrollKey: string;
  /** Called with the full new text of the side a chunk control changed. */
  onChange?: (target: "original" | "modified", content: string) => void;
  /** The inline layout's Revert button on each change, called with the change's lines; left out, none. */
  onRevert?: ((selection: LineSelection) => void) | null;
  /** The inline layout's Apply button on each change of a read-only diff (a commit's change into the work tree). */
  onApply?: ((selection: LineSelection) => void) | null;
  /** Side by side: the band's buttons, in the gutter of `side`. */
  bands?: { side: "left" | "right"; actions: ChunkActions } | null;
}

export class DiffEditors {
  chunkCount = $state(0);
  current = $state(-1);
  /** Changed lines the selection picks, for the line action buttons. */
  selectedLines = $state(0);
  /** The connector's bands side by side; null inline. */
  ribbons = $state.raw<ConnectorRibbon[] | null>(null);

  #view: MergeView | null = null;
  #link: SplitLink | null = null;
  /** The arrow on a band stages (copies the right side over the left) rather than unstages. */
  #copyToA = false;
  #inlineView: EditorView | null = null;
  #inlineDoc: InlineDoc | null = null;
  /** The backend's hunks of the texts on screen; null once a chunk control changed a side. */
  #viewHunks: LineHunk[] | null = null;
  /** The side the last selection was made in: the line actions read its selection. */
  #activeSide: DiffSide = "new";
  #strip: HTMLDivElement | null = null;
  #stripFrame = 0;
  #selectionFrame = 0;
  #observer: ResizeObserver | null = null;
  #token = 0;
  #lastScroll: { key: string; top: number } | null = null;
  #revealedToken = -1;

  /** The line to scroll the right side to (Back / Forward); a new token repeats it. */
  constructor(private readonly revealLine: () => { line: number; token: number } | null) {}

  /** The editor with the new text: the right side, or the inline layout's only editor. */
  newEditor(): EditorView | null {
    return this.#view?.b ?? this.#inlineView;
  }

  /** The left side's editor, side by side only. */
  oldEditor(): EditorView | null {
    return this.#view?.a ?? null;
  }

  changeCount(): number {
    return this.#view ? this.#view.chunks.length : (this.#inlineDoc?.blocks.length ?? 0);
  }

  /** Scrolls to the asked line once per token; true when it did. */
  applyReveal(editor: EditorView): boolean {
    const reveal = this.revealLine();
    if (!reveal || reveal.token === this.#revealedToken) {
      return false;
    }
    this.#revealedToken = reveal.token;
    revealNewLine(editor, reveal.line, this.#inlineDoc);
    return true;
  }

  /** The new text's line to open the file at: the cursor line when it is on screen, else the top line. */
  lineOnScreen(editor: EditorView): number {
    return newLineOnScreen(editor, this.#inlineDoc);
  }

  teardown(scrollKey: string): void {
    this.#token++;
    // The right side (or the inline editor) keeps the place; the left one follows it.
    const scroller = this.newEditor()?.scrollDOM;
    if (!scroller) {
      return;
    }
    this.#lastScroll = { key: scrollKey, top: scroller.scrollTop };
    cancelAnimationFrame(this.#stripFrame);
    cancelAnimationFrame(this.#selectionFrame);
    this.#viewHunks = null;
    this.selectedLines = 0;
    this.#observer?.disconnect();
    this.#observer = null;
    this.#strip?.remove();
    this.#strip = null;
    this.#link?.dispose();
    this.#link = null;
    this.ribbons = null;
    this.#view?.destroy();
    this.#view = null;
    this.#inlineView?.destroy();
    this.#inlineView = null;
    this.#inlineDoc = null;
  }

  async build(request: DiffBuild): Promise<void> {
    const token = ++this.#token;
    const { parts, diff: fileDiff, mode, collapse } = request;
    const language = await editorLanguage(request.path);
    if (token !== this.#token) {
      return;
    }
    const changedSide = mode === "unstaged" ? "original" : "modified";
    const navigation = keymap.of([
      { key: "F7", run: () => this.goToChunk(1) },
      { key: "Shift-F7", run: () => this.goToChunk(-1) },
    ]);
    const listener = EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.transactions.some((transaction) => transaction.isUserEvent("revert"))) {
        return;
      }
      this.chunkCount = this.#view?.chunks.length ?? 0;
      if (this.current >= this.chunkCount) {
        this.current = -1;
      }
      // The hunks no longer fit this text; the reloaded diff brings new ones.
      this.#viewHunks = null;
      this.scheduleSelectionCount();
      request.onChange?.(changedSide, update.state.doc.toString());
    });
    const selectionWatch = (side: DiffSide) =>
      EditorView.updateListener.of((update) => {
        const picked = update.transactions.some((transaction) => transaction.isUserEvent("select"));
        if (picked || (update.focusChanged && update.view.hasFocus)) {
          this.#activeSide = side;
        }
        if (update.selectionSet || update.focusChanged) {
          this.scheduleSelectionCount();
        }
      });
    const geometry = EditorView.updateListener.of((update) => {
      if (update.docChanged || update.geometryChanged || update.heightChanged || update.viewportChanged) {
        this.scheduleStrip();
      }
    });
    const sideExtensions = (changes: boolean, findHost: HTMLElement, side: DiffSide, numbered = true): Extension[] =>
      baseExtensions({
        readOnly: true,
        lineNumbers: numbered,
        extensions: [
          language,
          diffTheme,
          sideColors,
          chunkKinds,
          navigation,
          geometry,
          selectionWatch(side),
          changes ? listener : [],
          panels({ topContainer: findHost }),
        ],
      });
    const blameExtensions = request.blame
      ? blameExtension({ inline: settings.currentLineBlame, gutter: settings.blameGutter })
      : [];

    let editor: EditorView;
    let shown: InlineDoc | null = null;
    if (request.layout === "inline") {
      const built = inlineEditor(request, sideExtensions, blameExtensions);
      editor = built.editor;
      shown = built.doc;
      this.#inlineView = editor;
      this.#inlineDoc = shown;
    } else {
      this.#view = splitEditors(request, sideExtensions, blameExtensions);
      editor = this.#view.b;
      this.#link = new SplitLink(this.#view, parts.body, (ribbons) => (this.ribbons = ribbons));
      this.#copyToA = mode === "unstaged";
      this.ribbons = [];
    }
    this.#viewHunks = fileDiff.hunks ?? null;
    this.#activeSide = "new";
    if (request.blame) {
      const inlineBlame = shown ? { text: fileDiff.modified, newLineOf: shown.lines.map((line) => line.new) } : null;
      void loadBlame(editor, request.blame, fileDiff.modifiedEol, inlineBlame);
    }
    this.chunkCount = this.changeCount();
    this.current = -1;
    this.scheduleSelectionCount();
    this.#strip = createStrip((line) => jumpToLine(editor, line));
    parts.body.appendChild(this.#strip);
    this.#observer = new ResizeObserver(() => this.scheduleStrip());
    this.#observer.observe(parts.body);
    this.scheduleStrip();
    this.#restoreScroll(editor, request.scrollKey);
  }

  /** Back to where the same diff was, else to the asked line, else to the first change. */
  #restoreScroll(editor: EditorView, scrollKey: string): void {
    const restore = this.#lastScroll?.key === scrollKey ? this.#lastScroll.top : null;
    requestAnimationFrame(() => {
      if (this.newEditor() === editor && !this.applyReveal(editor)) {
        if (restore !== null) {
          editor.scrollDOM.scrollTop = restore;
        } else if (this.changeCount() > 0) {
          this.current = 0;
          this.#revealChange(0);
        }
      }
      this.#link?.align();
    });
  }

  /** The ruler's ticks, and the connector's bands with them (the same geometry moves both). */
  scheduleStrip(): void {
    this.#link?.schedule();
    cancelAnimationFrame(this.#stripFrame);
    this.#stripFrame = requestAnimationFrame(() => {
      const editor = this.newEditor();
      const strip = this.#strip;
      if (editor && strip) {
        const marks = rulerMarks(editor, this.#view?.chunks ?? null, this.#inlineDoc);
        renderTicks(strip, layoutTicks(editor, marks, strip.clientHeight));
      }
    });
  }

  /** Makes the side `editor` belongs to the one the line actions read. */
  activate(editor: EditorView): void {
    this.#activeSide = editor === this.oldEditor() ? "old" : "new";
  }

  /** The changed lines the selection of the active side picks; none without fitting hunks. */
  currentSelection(): LineSelection {
    const side = this.#activeSide;
    const editor = side === "old" ? this.oldEditor() : this.newEditor();
    return selectedLines(editor, this.#viewHunks, side, this.#inlineDoc);
  }

  scheduleSelectionCount(): void {
    cancelAnimationFrame(this.#selectionFrame);
    this.#selectionFrame = requestAnimationFrame(() => {
      this.selectedLines = selectionSize(this.currentSelection());
    });
  }

  #revealChange(index: number): void {
    revealChange(this.newEditor(), this.#view, this.#inlineDoc, index);
  }

  /** The lines of the side by side change `index`, for its Revert button. */
  changeLines(index: number): LineSelection | null {
    const view = this.#view;
    const chunk = view?.chunks[index];
    return view && chunk ? chunkSelection(chunk, view.a.state.doc, view.b.state.doc) : null;
  }

  /** The arrow on band `index`: stage or unstage that change. */
  copyChange(index: number): void {
    this.#link?.copy(index, this.#copyToA);
  }

  goToChunk(direction: 1 | -1): boolean {
    const count = this.changeCount();
    if (count === 0) {
      return false;
    }
    if (this.current < 0 || this.current >= count) {
      this.current = direction > 0 ? 0 : count - 1;
    } else {
      this.current = (this.current + direction + count) % count;
    }
    this.#revealChange(this.current);
    return true;
  }
}
