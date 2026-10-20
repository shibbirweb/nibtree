// A file editor's change peek, like VS Code's: a click on a change bar opens that change's diff against the index
// under it (peekField.ts, ChangePeek.svelte), with the next and previous change, Stage and Revert. Revert is an edit
// of the editor's text (Undo brings it back); Stage writes the change into the index and refreshes the bars.
import { mount, unmount } from "svelte";
import type { EditorView } from "@codemirror/view";
import { api } from "$lib/api";
import type { LineHunk } from "$lib/editor/lineDiff";
import { revertEdit } from "$lib/editor/revertLines";
import { repoStore } from "$lib/stores/repo.svelte";
import type { RepoLocation } from "$lib/stores/workspacePaths";
import type { Eol, LineSelection } from "$lib/types";
import { dialogs } from "$lib/ui/dialog.svelte";
import { toast } from "$lib/ui/toast.svelte";
import ChangePeek from "./ChangePeek.svelte";
import { type PeekTarget, peekField, showPeek } from "./peekField";
import {
  changeIndexAt,
  hunkIndexOf,
  hunkKind,
  indexAfterRevert,
  peekChanges,
  peekLine,
  stagedText,
  stepIndex,
  viewHunks,
} from "./peekModel";

export interface PeekHost {
  view: () => EditorView | null;
  location: () => RepoLocation | null;
  eol: () => Eol | null;
  /** The path HEAD has the file under (a staged rename), for a file the index does not have. */
  origPath: (repoPath: string) => string | null;
  /** Brings the change bars up to date after the index changed. */
  refreshMarks: () => Promise<void>;
}

interface Shown {
  base: string;
  text: string;
  hunks: LineHunk[];
  index: number;
}

export class FilePeek {
  #token = 0;
  #shown: Shown | null = null;

  constructor(private readonly host: PeekHost) {}

  extension() {
    return peekField((element, target) => this.#render(element, target));
  }

  /** Opens the peek on the change at the 0-based `line` (a click on its bar). */
  async open(line: number): Promise<void> {
    await this.#load((hunks, lines) => changeIndexAt(hunks, line, lines));
  }

  close(): void {
    this.#shown = null;
    this.host.view()?.dispatch({ effects: showPeek.of(null) });
  }

  step(direction: 1 | -1): void {
    const view = this.host.view();
    const shown = this.#shown;
    if (view && shown) {
      this.#show(view, { ...shown, index: stepIndex(shown.index, shown.hunks.length, direction) });
    }
  }

  /** Writes the shown change into the index; the peek moves on to the change that takes its place. */
  async stage(): Promise<void> {
    const owner = this.host.location();
    const shown = this.#shown;
    if (!owner || !shown) {
      return;
    }
    const content = stagedText(shown.base, shown.text, shown.hunks[shown.index]);
    const eol = this.host.eol() ?? "lf";
    await repoStore.run("Stage change", (repoPath) => api.stageContent(repoPath, owner.repoPath, content, eol), {
      repoPath: owner.repo.root,
      refresh: "status",
    });
    await this.host.refreshMarks();
    await this.#load((hunks) => Math.min(shown.index, hunks.length - 1));
  }

  /**
   * After a confirm, the lines of change `target` (the shown one, or any change's own button in the peek's diff) go
   * back to the index's, as one edit of the text.
   */
  async revert(target = this.#shown?.index ?? -1): Promise<void> {
    const owner = this.host.location();
    const view = this.host.view();
    const shown = this.#shown;
    if (!owner || !view || !shown || view.state.readOnly || !shown.hunks[target]) {
      return;
    }
    const fileName = owner.repoPath.split("/").pop() ?? owner.repoPath;
    const confirmed = await dialogs.confirm({
      title: "Revert Change",
      message:
        `Revert this change in ${fileName}? Its lines go back to the staged version ` +
        "(the last commit when nothing is staged).",
      confirmLabel: "Revert",
      danger: true,
    });
    if (!confirmed || this.host.view() !== view || view.state.doc.toString() !== shown.text) {
      return;
    }
    const edit = revertEdit(view.state.doc, shown.hunks[target], shown.base.split("\n"));
    view.dispatch({ changes: edit, selection: { anchor: edit.from }, userEvent: "input.revert" });
    await this.#load((hunks) => indexAfterRevert(shown.index, target, hunks.length));
  }

  /** Reads the index version and shows the change `pick` chooses; none left (or -1) closes the peek. */
  async #load(pick: (hunks: LineHunk[], lines: number) => number): Promise<void> {
    const owner = this.host.location();
    const view = this.host.view();
    if (!owner || !view) {
      return;
    }
    let base;
    try {
      base = await api.readBaseFile(owner.repo.root, owner.repoPath, this.host.origPath(owner.repoPath));
    } catch (error) {
      toast.error("Could not read the staged version", String(error));
      return;
    }
    if (this.host.view() !== view || base.binary || base.tooLarge) {
      return;
    }
    const text = view.state.doc.toString();
    const hunks = peekChanges(base.content, text);
    const index = pick(hunks, view.state.doc.lines);
    if (index < 0 || index >= hunks.length) {
      this.close();
      return;
    }
    this.#show(view, { base: base.content, text, hunks, index });
  }

  /** Puts the cursor on the change and the peek under it. */
  #show(view: EditorView, shown: Shown): void {
    this.#shown = shown;
    const doc = view.state.doc;
    const hunk = shown.hunks[shown.index];
    const pos = doc.line(peekLine(hunk, doc.lines) + 1).to;
    const anchor = doc.line(Math.min(hunk.newStart, doc.lines - 1) + 1).from;
    view.dispatch({ selection: { anchor }, effects: showPeek.of({ token: ++this.#token, pos }) });
  }

  #render(element: HTMLElement, target: PeekTarget): () => void {
    const shown = this.#shown;
    const owner = this.host.location();
    const view = this.host.view();
    if (!shown || !owner || !view || target.token !== this.#token) {
      return () => undefined;
    }
    const handle = mount(ChangePeek, {
      target: element,
      props: {
        path: owner.repoPath,
        base: shown.base,
        text: shown.text,
        eol: this.host.eol() ?? "lf",
        hunks: viewHunks(shown.hunks),
        index: shown.index,
        kind: hunkKind(shown.hunks[shown.index]),
        editable: !view.state.readOnly,
        onstage: () => void this.stage(),
        onrevert: () => void this.revert(),
        onrevertchange: (selection: LineSelection) => void this.revert(hunkIndexOf(shown.hunks, selection)),
        onstep: (direction) => this.step(direction),
        onclose: () => {
          this.close();
          view.focus();
        },
      },
    });
    return () => void unmount(handle);
  }
}
