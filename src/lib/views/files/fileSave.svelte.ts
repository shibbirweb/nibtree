// Writing a file editor's text: Save, Mark as Resolved, Local History's Revert, auto save (Settings > Editor >
// Saving) and the tab's place for Reopen tabs on start and Reopen Closed Tab.
import type { Extension, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { api, errorMessage } from "$lib/api";
import { type AutoSaveTrigger, shouldAutoSave } from "$lib/editor/autoSave";
import { caretLines, saveCleanupTransaction } from "$lib/editor/saveCleanup";
import { isReplay } from "$lib/editor/sharedDocs";
import { repoStore } from "$lib/stores/repo.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { relativeTo } from "$lib/stores/workspacePaths";
import { toast } from "$lib/ui/toast.svelte";
import type { FileEditor } from "./fileEditor.svelte";
import { currentPosition } from "./filePosition";
import { whenIdle } from "./saveQueue";

export class FileSaver {
  saving = $state(false);
  #autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  #positionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly editor: FileEditor) {}

  get #name(): string {
    const filePath = this.editor.ctx.filePath;
    return filePath.split("/").pop() ?? filePath;
  }

  /** Both editors of the file are idle. */
  get busy(): boolean {
    return this.saving || this.editor.shared.saving;
  }

  /**
   * Writes the editor content; `quiet` skips the toast (Save All shows one for every file),
   * `auto` is an auto save, which leaves the lines with a caret alone in the clean-ups.
   */
  async save(options: { quiet?: boolean; auto?: boolean } = {}): Promise<boolean> {
    // A save still writing: this one follows it, so the newest text is written too.
    if (!(await whenIdle(() => this.busy))) {
      return false;
    }
    const { ctx, file, shared } = this.editor;
    const root = ctx.folder()?.root;
    if (!this.editor.view || !file || !root) {
      return false;
    }
    // Rich Editor: its last keystrokes are in the text before it is written.
    ctx.flushRich();
    this.#cleanUp(options.auto ?? false);
    const snapshot = this.editor.view.state.doc;
    this.#begin();
    let saved = false;
    try {
      shared.diskVersion = await api.writeWorktreeFile(
        root,
        relativeTo(root, ctx.filePath),
        snapshot.toString(),
        file.eol,
      );
      saved = true;
      if (!options.quiet) {
        toast.success(`Saved ${this.#name}`);
      }
      this.editor.git.refreshBlame();
      const location = ctx.location();
      if (location) {
        // One status read: the watcher's event for this write, or a fallback if none comes.
        repoStore.fileSaved(location.repo.root);
      }
    } catch (error) {
      toast.error("Save failed", errorMessage(error));
    }
    this.#end(saved ? snapshot : null);
    return saved;
  }

  /** Writes the editor content and stages it, which clears the conflict in git. */
  async markResolved(): Promise<void> {
    const { ctx, file, view } = this.editor;
    const owner = ctx.location();
    if (!view || !file || !owner || this.busy) {
      return;
    }
    const snapshot = view.state.doc;
    this.#begin();
    const done = await repoStore.run(
      "Mark resolved",
      (repoPath) => api.saveResolution(repoPath, owner.repoPath, snapshot.toString(), file.eol).then(() => true),
      { success: `Resolved ${this.#name}`, repoPath: owner.repo.root },
    );
    this.#end(done ? snapshot : null);
  }

  #begin(): void {
    this.saving = true;
    this.editor.shared.saving = true;
  }

  /** `written` is the text now on disk: the new baseline for unsaved edits. */
  #end(written: Text | null): void {
    this.saving = false;
    this.editor.shared.saving = false;
    const view = this.editor.view;
    if (written && view) {
      this.editor.shared.baseline = written;
      repoStore.setDirty(this.editor.ctx.filePath, !view.state.doc.eq(written));
    }
  }

  /** Local History > Revert: the version's text as one change, so Undo brings the edits back. */
  replaceText(text: string): boolean {
    const view = this.editor.view;
    if (!view || !this.editor.editable || this.editor.loadError !== null) {
      return false;
    }
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: "input.revert" });
    view.focus();
    return true;
  }

  /** Settings > Editor > Saving: trim whitespace and fix final newlines as one undoable change. */
  #cleanUp(auto: boolean): void {
    const view = this.editor.view;
    if (!view) {
      return;
    }
    const spec = saveCleanupTransaction(view.state, {
      trimTrailingWhitespace: settings.trimTrailingWhitespace,
      insertFinalNewline: settings.insertFinalNewline,
      trimFinalNewlines: settings.trimFinalNewlines,
      markdown: this.editor.ctx.isMarkdown,
      keepLines: auto ? caretLines(view.state) : undefined,
    });
    if (spec) {
      view.dispatch(spec);
    }
  }

  // Auto save: after a pause in typing, or when the focus leaves this editor (another tab, another part of the
  // window, another app). Conflicted files and a file open in the merge tool are only saved by hand.
  async autoSave(trigger: AutoSaveTrigger): Promise<void> {
    clearTimeout(this.#autoSaveTimer);
    const { ctx } = this.editor;
    const location = ctx.location();
    const ok = shouldAutoSave({
      mode: settings.autoSave,
      trigger,
      dirty: repoStore.isDirty(ctx.filePath),
      editable: this.editor.view !== null && this.editor.editable && this.editor.loadError === null,
      saving: this.saving,
      conflicted: ctx.conflicted(),
      inMergeTool:
        location !== null && repoStore.repo?.root === location.repo.root && repoStore.mergeTarget === location.repoPath,
    });
    if (!ok) {
      return;
    }
    const saved = await this.save({ quiet: true, auto: true });
    // Typing went on while it was written.
    if (saved && repoStore.isDirty(ctx.filePath)) {
      this.#scheduleAutoSave();
    }
  }

  #scheduleAutoSave(): void {
    clearTimeout(this.#autoSaveTimer);
    if (settings.autoSave === "afterDelay") {
      this.#autoSaveTimer = setTimeout(() => void this.autoSave("delay"), settings.autoSaveDelayMs);
    }
  }

  /** Where the caret and view are, for Reopen tabs on start and Reopen Closed Tab. */
  notePosition(): void {
    const view = this.editor.view;
    if (!view) {
      return;
    }
    const position = currentPosition(view);
    // A hidden editor measures nothing; the last top line is kept then.
    repoStore.noteTabPosition(this.editor.ctx.filePath, position.line, position.column, position.topLine);
  }

  #schedulePosition(): void {
    clearTimeout(this.#positionTimer);
    this.#positionTimer = setTimeout(() => this.notePosition(), 500);
  }

  /** Notes the place as it moves and auto saves after edits and when the editor loses the focus. */
  extension(): Extension {
    return [
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          this.#schedulePosition();
        }
        if (update.docChanged && !isReplay(update)) {
          this.#scheduleAutoSave();
        }
      }),
      EditorView.domEventObservers({
        scroll: () => this.#schedulePosition(),
        blur: () => void this.autoSave("focus"),
      }),
    ];
  }

  dispose(): void {
    clearTimeout(this.#autoSaveTimer);
    clearTimeout(this.#positionTimer);
  }
}
