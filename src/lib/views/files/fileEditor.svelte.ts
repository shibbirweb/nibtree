// The editor of a work tree file (FileView.svelte): reads it into CodeMirror, follows the disk, the conflicts, F7
// and the status bar. Saving is in fileSave.svelte.ts, git marks and peek in fileGitInfo.ts, splits in sharedDocs.ts.
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { api, errorMessage } from "$lib/api";
import { blameExtension } from "$lib/editor/blame";
import { conflictField, conflictMarkers } from "$lib/editor/conflictDecorations";
import { editorIndent } from "$lib/editor/indentation";
import type { ChangeMark } from "$lib/editor/lineDiff";
import { sectionAt } from "$lib/editor/navigation";
import { changeGutter, changeMarkField, scrollMarkers } from "$lib/editor/scrollMarkers";
import { baseExtensions, editorLanguage } from "$lib/editor/setup";
import { type DocMember, isReplay, type SharedDoc, sharedDocs, syncedDispatch } from "$lib/editor/sharedDocs";
import { wordWrap } from "$lib/editor/wordWrap";
import { localHistory } from "$lib/localHistory/localHistory.svelte";
import { editorStatus } from "$lib/stores/editorStatus.svelte";
import { navigation } from "$lib/stores/navigation.svelte";
import { isMissingFileError } from "$lib/stores/navHistory";
import { repoStore } from "$lib/stores/repo.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { unsavedText } from "$lib/stores/unsavedText.svelte";
import { type FolderRef, relativeTo, type RepoLocation } from "$lib/stores/workspacePaths";
import type { FileContent, RepoStatus } from "$lib/types";
import { conflictAwareMarks, FileGitInfo } from "./fileGitInfo";
import { fileKeys } from "./fileKeys";
import { applyDiskText, cursorLine, editorStatusOf, goToSection, restorePosition, revealLine } from "./filePosition";
import { FileSaver } from "./fileSave.svelte";

export interface FileEditorContext {
  filePath: string;
  groupId: number;
  isMarkdown: boolean;
  /** The workspace folder holding the file; reads and writes go through it. */
  folder: () => FolderRef | null;
  location: () => RepoLocation | null;
  repoStatus: () => RepoStatus | null;
  /** This tab is shown in the focused group, so it feeds the status bar. */
  isActive: () => boolean;
  /** Git lists the file as conflicted. */
  conflicted: () => boolean;
  /** A rich edit still waiting for a pause in typing goes into the text first (Rich Editor). */
  flushRich: () => void;
  openMergeTool: () => void;
  /** The line a Back / Forward or Go to File opened the editor at, for the Markdown preview. */
  onOpenedAt: (line: number) => void;
}

export class FileEditor {
  file = $state.raw<FileContent | null>(null);
  loadError = $state<string | null>(null);
  /** Conflict marker regions currently in the editor. */
  conflictCount = $state(0);
  /** Changes and conflicts F7 moves between, and the one at the caret. */
  navMarks = $state.raw<ChangeMark[]>([]);
  navIndex = $state(-1);
  /** Bumped on every edit so the preview knows to render again. */
  docVersion = $state(0);
  /** The same editor, for the Markdown preview's scroll sync. */
  editorView = $state.raw<EditorView | null>(null);
  view: EditorView | null = null;
  host: HTMLElement | null = null;
  /** This editor in the file's shared document: the saved text, the disk version and the saving flag live there. */
  readonly member: DocMember<EditorView> = { view: null };
  readonly shared: SharedDoc<EditorView>;
  readonly git: FileGitInfo;
  readonly saver: FileSaver;
  readonly markSource = conflictAwareMarks();
  #requestId = 0;

  constructor(readonly ctx: FileEditorContext) {
    this.shared = sharedDocs.join(ctx.filePath, this.member);
    this.git = new FileGitInfo({
      filePath: ctx.filePath,
      view: () => this.view,
      location: ctx.location,
      repoStatus: ctx.repoStatus,
      eol: () => this.file?.eol ?? null,
    });
    this.saver = new FileSaver(this);
  }

  get editable(): boolean {
    return this.file !== null && !this.file.binary && !this.file.tooLarge;
  }

  reportStatus(state: EditorState | undefined = this.view?.state): void {
    if (state && this.file && this.ctx.isActive()) {
      editorStatus.report(editorStatusOf(state, this.ctx.filePath, this.file.eol));
    }
  }

  goToSection(direction: 1 | -1): boolean {
    return this.view ? goToSection(this.view, this.navMarks, direction) : false;
  }

  #updateNav(state: EditorState): void {
    const marks = this.markSource(state) as ChangeMark[];
    if (marks !== this.navMarks) {
      this.navMarks = marks;
    }
    this.navIndex = sectionAt(marks, state.doc.lineAt(state.selection.main.head).number - 1);
  }

  async load(quiet: boolean): Promise<void> {
    const root = this.ctx.folder()?.root;
    if (!root) {
      return;
    }
    const filePath = this.ctx.filePath;
    const shared = this.shared;
    const request = ++this.#requestId;
    // A refresh asks with the version on screen; Revert always reads the file again.
    const shown = this.file;
    const known = quiet && shown && (this.view || shown.binary || shown.tooLarge) ? shared.diskVersion : null;
    try {
      const next = await api.readWorktreeFile(root, relativeTo(root, filePath), known);
      if (request !== this.#requestId) {
        return;
      }
      this.loadError = null;
      if (next.unchanged) {
        // Same text on disk: only HEAD may have moved (a commit), which the git info checks.
        void this.git.refresh();
        return;
      }
      // A second editor starts from the first one's text, so it leaves the version that text came from.
      if (this.view || (sharedDocs.peers(filePath, this.member).length === 0 && !shared.text)) {
        shared.diskVersion = next.version;
      }
      const previousEol = this.file?.eol ?? next.eol;
      // The editor holds the text; the tab keeps only the file's details.
      this.file = { ...next, content: "" };
      if (next.binary || next.tooLarge) {
        this.#dropView();
        return;
      }
      if (this.view) {
        this.#reload(this.view, next.content, previousEol, quiet);
        return;
      }
      // Remember unsaved changes: the tab starts from the text kept last time, unsaved against the file on disk.
      const first = sharedDocs.peers(filePath, this.member).length === 0 && !shared.text;
      const kept = first && unsavedText.has(filePath) ? await unsavedText.read(filePath) : null;
      if (request !== this.#requestId) {
        return;
      }
      await this.#create(next.content, kept);
    } catch (error) {
      if (request !== this.#requestId) {
        return;
      }
      const missing = isMissingFileError(error);
      if (missing) {
        // Back / Forward must not lead to a file that is gone.
        navigation.forget(filePath);
      }
      this.loadError = missing || (quiet && this.file) ? "This file no longer exists on disk." : errorMessage(error);
    }
  }

  /** New text from disk into the open editor: only the changed part is replaced, so the caret and scroll stay. */
  #reload(view: EditorView, content: string, previousEol: FileContent["eol"], quiet: boolean): void {
    const previousText = view.state.doc.toString();
    // A change made outside the app: Local History keeps the text being replaced first
    // (Revert keeps the unsaved edits itself).
    if (applyDiskText(view, content) && quiet) {
      localHistory.noteReload(this.ctx.filePath, previousText, previousEol, "external");
    }
    this.shared.baseline = view.state.doc;
    repoStore.setDirty(this.ctx.filePath, false);
    this.conflictCount = view.state.field(conflictField).length;
    void this.git.refresh();
  }

  #dropView(): void {
    this.view?.destroy();
    this.view = null;
    this.editorView = null;
  }

  /** `kept` is unsaved text kept from last time (unsavedText.svelte.ts), shown instead of `content`. */
  async #create(content: string, kept: string | null): Promise<void> {
    const { filePath, groupId } = this.ctx;
    const language = await editorLanguage(filePath);
    // Wait for the editor host to render after `file` was set.
    await Promise.resolve();
    if (!this.host || this.view) {
      return;
    }
    // The file is open in the other group too, or its tab just moved here: start from that text,
    // unsaved edits included.
    const shared = this.shared;
    const peer = sharedDocs.peers(filePath, this.member)[0] ?? null;
    const moved = !peer && shared.text && repoStore.isDirty(filePath) ? shared.text : null;
    shared.text = null;
    const view = new EditorView({
      parent: this.host,
      dispatchTransactions: syncedDispatch(filePath, this.member),
      state: EditorState.create({
        doc: peer ? peer.state.doc : (moved ?? kept ?? content),
        extensions: [
          fileKeys(this.ctx.isMarkdown, {
            save: () => void this.saver.save(),
            goToSection: (direction) => this.goToSection(direction),
          }),
          this.#listeners(),
          baseExtensions({ readOnly: false }),
          wordWrap(settings.wordWrap),
          language,
          conflictMarkers({ onOpenMergeTool: this.ctx.openMergeTool }),
          changeMarkField,
          blameExtension({ inline: settings.currentLineBlame, gutter: settings.blameGutter }),
          changeGutter(this.markSource, (line) => void this.git.peek.open(line)),
          this.git.peek.extension(),
          scrollMarkers(this.markSource),
          this.saver.extension(),
        ],
      }),
    });
    this.view = view;
    this.editorView = view;
    this.member.view = view;
    // The preview may have mounted before the editor existed; it renders the new text now.
    this.docVersion++;
    if ((!peer && !moved) || !shared.baseline) {
      shared.baseline = kept !== null && !peer && !moved ? view.state.toText(content) : view.state.doc;
    }
    this.conflictCount = view.state.field(conflictField).length;
    void this.git.refresh();
    this.#updateNav(view.state);
    this.reportStatus();
    // Opened by Back / Forward or Go to File: go to that line; otherwise this is a new history entry.
    const reveal = navigation.takeReveal(filePath, groupId);
    // A tab restored at start or reopened comes back where it was, unless asked for a line.
    const restored = repoStore.takePendingPosition(filePath);
    if (reveal?.line != null) {
      revealLine(view, reveal.line, reveal.column ?? 0);
      this.ctx.onOpenedAt(reveal.line);
    } else if (restored) {
      restorePosition(view, restored);
    }
    if (reveal?.focus) {
      view.focus();
    }
    navigation.record({ filePath, line: cursorLine(view) });
    repoStore.setDirty(filePath, !view.state.doc.eq(shared.baseline ?? view.state.doc));
  }

  #listeners() {
    const filePath = this.ctx.filePath;
    return EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.length > 0)) {
        this.#updateNav(update.state);
      }
      // A changed Detect indentation or Tab size setting reads the file again.
      if (editorIndent(update.startState) !== editorIndent(update.state)) {
        this.reportStatus(update.state);
      }
      if (update.selectionSet || update.docChanged) {
        this.reportStatus(update.state);
        // A change replayed from the file's other editor is not a place the user went to.
        if (update.selectionSet || !isReplay(update)) {
          navigation.record({ filePath, line: update.state.doc.lineAt(update.state.selection.main.head).number - 1 });
        }
      }
      // The editor that made the change reports unsaved edits, for both.
      if (update.docChanged && this.shared.baseline && !isReplay(update)) {
        const unsaved = !update.state.doc.eq(this.shared.baseline);
        repoStore.setDirty(filePath, unsaved);
        if (unsaved) {
          unsavedText.schedule(filePath, () => this.view?.state.doc.toString() ?? null);
        }
      }
      if (update.docChanged) {
        this.conflictCount = update.state.field(conflictField).length;
        this.git.scheduleMarks();
        this.docVersion++;
      }
    });
  }

  /** The tab closes or moves to the other group. */
  destroy(): void {
    const filePath = this.ctx.filePath;
    this.member.view = null;
    // Its text stays for a moment, for the editor that takes its place when the tab moves to the other group.
    sharedDocs.leave(filePath, this.member, this.view?.state.doc ?? null);
    // The file's editor in the other group keeps the status bar.
    if (sharedDocs.peers(filePath, this.member).length === 0) {
      editorStatus.clear(filePath);
    }
    this.git.dispose();
    this.saver.dispose();
    // Remember unsaved changes: a waiting write goes now, while the text is still here.
    unsavedText.writeNow(filePath);
    // A closed tab keeps its caret for Reopen Closed Tab.
    this.saver.notePosition();
    this.#dropView();
  }
}
