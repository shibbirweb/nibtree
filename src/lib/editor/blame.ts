// Git blame in CodeMirror: an inline note at the
// end of the cursor line ("Author, 3 months ago - summary") and an optional
// gutter column with the commit, author and age of every block of lines.

import { Compartment, type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutter,
  layer,
  type LayerMarker,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { api, errorMessage } from "$lib/api";
import { fullDate, relativeTime } from "$lib/log/format";
import type { NavLocation } from "$lib/stores/navHistory";
import type { BlameCommit, Eol } from "$lib/types";
import { navigation } from "$lib/stores/navigation.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { toast } from "$lib/ui/toast.svelte";
import { type NotePlacement, placeNote } from "./inlineBlameLayout";
import {
  ageRanks,
  allUncommitted,
  type BlameState,
  commitAt,
  commitLineTarget,
  expandBlame,
  fromInfo,
  isRemoved,
  isUncommitted,
  mapBlame,
} from "./blameModel";
import { blameTheme } from "@nibtree/ui/editor/blameTheme";

export const setBlame = StateEffect.define<BlameState | null>();

export const blameField = StateField.define<BlameState | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlame)) {
        return effect.value;
      }
    }
    if (value && tr.docChanged) {
      return mapBlame(value, tr.changes, tr.startState.doc, tr.state.doc);
    }
    return value;
  },
});

function describe(commit: BlameCommit | null): { label: string; title: string } {
  if (!commit || commit.uncommitted) {
    return { label: "You, Uncommitted changes", title: "Not committed yet. Click to show your changes." };
  }
  const summary = commit.summary || "(no message)";
  return {
    label: `${commit.authorName}, ${relativeTime(commit.authorTime)} • ${summary}`,
    title: `${summary}\n\n${commit.authorName} <${commit.authorEmail}>\n${fullDate(commit.authorTime)}\ncommit ${commit.id}\n\nClick to show this commit in the Log, Option-click to copy its hash`,
  };
}

async function copyHash(commit: BlameCommit | null): Promise<void> {
  if (!commit || commit.uncommitted) {
    return;
  }
  try {
    await navigator.clipboard.writeText(commit.id);
    toast.success(`Copied ${commit.shortId}`);
  } catch (error) {
    toast.error("Could not copy", errorMessage(error));
  }
}

/**
 * Click on a blame note or gutter block: open the commit in the Log on the
 * same line of its version of the file (Option-click copies the hash). The
 * clicked line is recorded first so the Back button returns to it.
 */
function openBlame(
  view: EditorView,
  blame: BlameState | null,
  commit: BlameCommit | null,
  event: MouseEvent,
  line: number,
): void {
  if (!commit || commit.uncommitted) {
    settings.setLeftPanel("changes");
    return;
  }
  if (event.altKey || !blame?.repoRoot) {
    void copyHash(commit);
    return;
  }
  const from = blame.origin?.(line) ?? null;
  const doc = view.state.doc;
  const lineText = line < doc.lines ? doc.line(line + 1).text : "";
  void navigation.openCommit(
    {
      repoRoot: blame.repoRoot,
      commitId: commit.id,
      filePath: blame.filePath ?? null,
      ...commitLineTarget(blame, line, lineText),
    },
    from,
  );
}

/**
 * The current-line note, drawn in its own layer beside the end of the line (see
 * inlineBlameLayout.ts): it takes no room in the text, so lines never wrap or move because
 * of it, and clicks go through to the code unless Cmd (Ctrl elsewhere) is held.
 */
class InlineBlameMarker implements LayerMarker {
  constructor(
    readonly view: EditorView,
    readonly placement: NotePlacement,
    readonly commit: BlameCommit | null,
    readonly label: string,
    readonly title: string,
    readonly blame: BlameState | null,
    readonly line: number,
  ) {}

  eq(other: InlineBlameMarker): boolean {
    return (
      this.sameNote(other) &&
      other.placement.left === this.placement.left &&
      other.placement.top === this.placement.top &&
      other.placement.height === this.placement.height &&
      other.placement.maxWidth === this.placement.maxWidth
    );
  }

  private sameNote(other: InlineBlameMarker): boolean {
    return (
      other.label === this.label &&
      other.title === this.title &&
      other.line === this.line &&
      other.commit === this.commit &&
      other.blame?.repoRoot === this.blame?.repoRoot &&
      other.blame?.origin === this.blame?.origin
    );
  }

  draw(): HTMLElement {
    const element = document.createElement("div");
    element.className = "cm-inline-blame";
    element.textContent = this.label;
    element.title = this.title;
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", (event) => openBlame(this.view, this.blame, this.commit, event, this.line));
    this.place(element);
    return element;
  }

  update(element: HTMLElement, previous: InlineBlameMarker): boolean {
    // The listeners belong to the note they were made for; another note gets a new element.
    if (!this.sameNote(previous)) {
      return false;
    }
    this.place(element);
    return true;
  }

  private place(element: HTMLElement): void {
    const { left, top, height, maxWidth } = this.placement;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.height = `${height}px`;
    element.style.lineHeight = `${height}px`;
    element.style.maxWidth = maxWidth === null ? "" : `${maxWidth}px`;
  }
}

function inlineMarkers(view: EditorView): readonly LayerMarker[] {
  const state = view.state.field(blameField, false);
  if (!state) {
    return [];
  }
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  // The end of the line's last visual row, so a wrapped line keeps its note on its last row.
  const end = view.coordsAtPos(line.to, -1);
  if (!end) {
    return [];
  }
  // The same base as CodeMirror's own layers: the scrolled content's top left corner.
  const scroller = view.scrollDOM.getBoundingClientRect();
  const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
  const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
  const placement = placeNote(
    {
      right: (end.right - baseLeft) / view.scaleX,
      top: (end.top - baseTop) / view.scaleY,
      bottom: (end.bottom - baseTop) / view.scaleY,
    },
    (scroller.left + view.scrollDOM.clientWidth * view.scaleX - baseLeft) / view.scaleX,
    view.lineWrapping,
  );
  const index = line.number - 1;
  if (isRemoved(state, index)) {
    return [];
  }
  const commit = isUncommitted(state, index) ? null : commitAt(state, index);
  const { label, title } = describe(commit);
  return [new InlineBlameMarker(view, placement, commit, label, title, state, index)];
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

/** Holding Cmd (Ctrl elsewhere) makes the note clickable, like a link. */
const noteClickKey = ViewPlugin.fromClass(
  class {
    private readonly onKey = (event: KeyboardEvent | MouseEvent): void => {
      this.set(isMac ? event.metaKey : event.ctrlKey);
    };
    private readonly onBlur = (): void => this.set(false);

    constructor(readonly view: EditorView) {
      window.addEventListener("keydown", this.onKey, true);
      window.addEventListener("keyup", this.onKey, true);
      view.scrollDOM.addEventListener("mousemove", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }

    private set(held: boolean): void {
      if (held) {
        this.view.scrollDOM.dataset.gmBlameClick = "";
      } else {
        delete this.view.scrollDOM.dataset.gmBlameClick;
      }
    }

    destroy(): void {
      window.removeEventListener("keydown", this.onKey, true);
      window.removeEventListener("keyup", this.onKey, true);
      this.view.scrollDOM.removeEventListener("mousemove", this.onKey);
      window.removeEventListener("blur", this.onBlur);
      this.set(false);
    }
  },
);

const inlineBlame: Extension = [
  layer({
    above: true,
    class: "cm-gm-blameLayer",
    markers: inlineMarkers,
    update: (update: ViewUpdate) =>
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.startState.field(blameField, false) !== update.state.field(blameField, false),
  }),
  noteClickKey,
];

class BlameGutterMarker extends GutterMarker {
  constructor(
    readonly text: string,
    readonly heat: number,
    readonly first: boolean,
    readonly uncommitted: boolean,
    readonly tooltip: string,
  ) {
    super();
  }

  eq(other: BlameGutterMarker): boolean {
    return (
      other.text === this.text &&
      other.heat === this.heat &&
      other.first === this.first &&
      other.uncommitted === this.uncommitted &&
      other.tooltip === this.tooltip
    );
  }

  toDOM(): Node {
    const cell = document.createElement("div");
    cell.className = `cm-blame-cell${this.first ? " first" : ""}${this.uncommitted ? " uncommitted" : ""}`;
    cell.style.setProperty("--blame-heat", `${Math.round(20 + this.heat * 75)}%`);
    cell.textContent = this.first ? this.text : "";
    if (this.first) {
      cell.title = this.tooltip;
    }
    return cell;
  }
}

function gutterText(commit: BlameCommit | null): string {
  if (!commit || commit.uncommitted) {
    return "Uncommitted";
  }
  return `${commit.shortId.slice(0, 7)}  ${commit.authorName}  ${relativeTime(commit.authorTime)}`;
}

// Per-state caches so scrolling does not rebuild markers.
const rankCache = new WeakMap<BlameState, number[]>();

function markerFor(state: EditorState, lineIndex: number): BlameGutterMarker | null {
  const blame = state.field(blameField, false);
  if (!blame) {
    return null;
  }
  let ranks = rankCache.get(blame);
  if (!ranks) {
    ranks = ageRanks(blame.commits);
    rankCache.set(blame, ranks);
  }
  if (isRemoved(blame, lineIndex)) {
    return null;
  }
  const owner = blame.lines[lineIndex] ?? -1;
  const first = lineIndex === 0 || blame.lines[lineIndex - 1] !== owner;
  const uncommitted = isUncommitted(blame, lineIndex);
  const commit = uncommitted ? null : commitAt(blame, lineIndex);
  const heat = owner >= 0 ? (ranks[owner] ?? 1) : 1;
  return new BlameGutterMarker(gutterText(commit), heat, first, uncommitted, describe(commit).title);
}

const blameGutter = gutter({
  class: "cm-blame-gutter",
  lineMarker: (view, line) => markerFor(view.state, view.state.doc.lineAt(line.from).number - 1),
  lineMarkerChange: (update) =>
    update.docChanged || update.startState.field(blameField, false) !== update.state.field(blameField, false),
  initialSpacer: () => new BlameGutterMarker("0000000  Someone Name  12 months ago", 1, true, false, ""),
  domEventHandlers: {
    click: (view, line, event) => {
      const blame = view.state.field(blameField, false);
      if (!blame) {
        return false;
      }
      const index = view.state.doc.lineAt(line.from).number - 1;
      if (isRemoved(blame, index)) {
        return false;
      }
      openBlame(view, blame, isUncommitted(blame, index) ? null : commitAt(blame, index), event as MouseEvent, index);
      return true;
    },
  },
});

const inlineCompartment = new Compartment();
const gutterCompartment = new Compartment();

export interface BlameDisplay {
  inline: boolean;
  gutter: boolean;
}

/** Blame support for an editor; nothing shows until `loadBlame` delivers data. */
export function blameExtension(display: BlameDisplay): Extension {
  return [
    blameField,
    blameTheme,
    inlineCompartment.of(display.inline ? inlineBlame : []),
    gutterCompartment.of(display.gutter ? blameGutter : []),
  ];
}

/** Switches the inline note and the gutter on or off without rebuilding the editor. */
export function setBlameDisplay(view: EditorView, display: BlameDisplay): void {
  view.dispatch({
    effects: [
      inlineCompartment.reconfigure(display.inline ? inlineBlame : []),
      gutterCompartment.reconfigure(display.gutter ? blameGutter : []),
    ],
  });
}

export interface BlameTarget {
  repoRoot: string;
  /** Repo-relative path. */
  filePath: string;
  /** Commit to blame at; null blames the given text against the work tree history. */
  revision: string | null;
  /** Builds the Back / Forward step for a clicked line, so Back returns to this view. */
  origin?: (line: number) => NavLocation;
}

/** An inline diff's editor: blame its new text, then spread it over the shown lines. */
export interface InlineBlameSource {
  text: string;
  /** Per document line, its line in `text`, or null for a removed line. */
  newLineOf: readonly (number | null)[];
}

/**
 * Fetches blame for the editor's current text (or an inline diff's new text). Results for
 * text that changed while the request ran are dropped; the caller asks again later.
 */
export async function loadBlame(
  view: EditorView,
  target: BlameTarget,
  eol: Eol,
  inline: InlineBlameSource | null = null,
): Promise<void> {
  const doc = view.state.doc;
  const text = inline?.text ?? doc.toString();
  const lineCount = inline ? text.split("\n").length : doc.lines;
  let blame: BlameState;
  try {
    const info =
      target.revision === null
        ? await api.blameContents(target.repoRoot, target.filePath, text, eol)
        : await api.blameFile(target.repoRoot, target.filePath, target.revision);
    blame = fromInfo(info, lineCount);
  } catch {
    // Typically a file git does not track yet: all of it is uncommitted work.
    blame = allUncommitted(lineCount);
  }
  blame = { ...blame, repoRoot: target.repoRoot, filePath: target.filePath, origin: target.origin };
  if (inline) {
    blame = expandBlame(blame, inline.newLineOf);
  }
  if (view.state.doc !== doc) {
    return;
  }
  view.dispatch({ effects: setBlame.of(blame) });
}
