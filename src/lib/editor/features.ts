// The IDE features of the editors: auto-close brackets, code completion, the fold gutter,
// indent guides, highlighting the word at the cursor, scrolling past the end, column
// selection, the right margin line, sticky scroll, the minimap, bracket pair colors and
// matching brackets. Each one sits in its own compartment, like the
// cursor and whitespace settings, so a changed setting reaches the open editors without
// rebuilding them. A feature that is off leaves an empty compartment, so nothing of it stays
// in memory, and the autocomplete package is only imported the first time it is needed.

import type * as Autocomplete from "@codemirror/autocomplete";
import { bracketMatching, foldGutter, language } from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Facet, Prec } from "@codemirror/state";
import { crosshairCursor, EditorView, keymap, rectangularSelection, scrollPastEnd, ViewPlugin } from "@codemirror/view";
import {
  EDITOR_FEATURES,
  type EditorFeature,
  type EditorFeatureOptions,
  type EditorKind,
  changedFeatures,
  featureApplies,
  needsAutocomplete,
  wordsWhileTyping,
} from "./featurePlan";
import { bracketPairColors } from "./bracketColors";
import { indentGuides } from "./indentGuides";
import { minimap } from "./minimap";
import { stickyScroll } from "./stickyScroll";
import { windowWords, wordPattern } from "./wordCompletion";
import { rulerLine } from "./ruler";
import { completionTheme, foldGutterTheme } from "@nibtree/ui/editor/panelThemes";

type AutocompleteModule = typeof Autocomplete;

const compartments = Object.fromEntries(EDITOR_FEATURES.map((feature) => [feature, new Compartment()])) as Record<
  EditorFeature,
  Compartment
>;

const kindFacet = Facet.define<EditorKind, EditorKind>({
  combine: (values) => values[0] ?? "file",
});

const views = new Set<EditorView>();

/** Remembers each editor so a changed setting reaches the ones already open. */
const registry = ViewPlugin.define((view) => {
  views.add(view);
  return {
    destroy() {
      views.delete(view);
    },
  };
});

/** The options the open editors were last given. */
let current: EditorFeatureOptions | null = null;
let autocomplete: AutocompleteModule | null = null;
let autocompleteLoading = false;

/** Imports the autocomplete package once, then gives it to the editors that wait for it. */
function loadAutocomplete(): void {
  if (autocomplete || autocompleteLoading) {
    return;
  }
  autocompleteLoading = true;
  import("@codemirror/autocomplete")
    .then((module) => {
      autocomplete = module;
      reconfigure(EDITOR_FEATURES.filter(needsAutocomplete));
    })
    .catch(() => {
      // The features stay off; the next editor tries again.
    })
    .finally(() => {
      autocompleteLoading = false;
    });
}

// Without "highlight the word", a selection still highlights its other matches, as before.
const selectionMatches = highlightSelectionMatches();
const wordMatches = highlightSelectionMatches({ highlightWordAroundCursor: true });

const matchingBrackets = bracketMatching();

const columnSelection: Extension = [
  // Option+Shift+click keeps adding a cursor (setup.ts), so Shift is left out here.
  rectangularSelection({ eventFilter: (event) => event.altKey && !event.shiftKey && event.button === 0 }),
  crosshairCursor({ key: "Alt" }),
];

function foldMarker(open: boolean): HTMLElement {
  const marker = document.createElement("span");
  marker.className = open ? "cm-gm-fold cm-gm-fold-open" : "cm-gm-fold cm-gm-fold-closed";
  return marker;
}

// Low precedence puts the fold gutter after the change and blame gutters, next to the text.
const folding: Extension = [Prec.low(foldGutter({ markerDOM: foldMarker })), foldGutterTheme];

function completionExtension(module: AutocompleteModule, onTyping: boolean): Extension {
  const words: Autocomplete.CompletionSource = (context) => {
    if (!context.explicit && !wordsWhileTyping(context.state.facet(language)?.name ?? null)) {
      return null;
    }
    const pattern = wordPattern(context.state.languageDataAt<string>("wordChars", context.pos)[0] ?? "");
    const token = context.matchBefore(new RegExp(`${pattern.source}$`, pattern.unicode ? "u" : ""));
    if (!token && !context.explicit) {
      return null;
    }
    const from = token ? token.from : context.pos;
    // Without a type, a word that is also a keyword or a variable of the language is listed once.
    const options = windowWords(context.state.doc, context.pos, pattern, from).map((label) => ({ label }));
    return { from, options, validFor: new RegExp(`^${pattern.source}`, pattern.unicode ? "u" : "") };
  };
  const wordData = [{ autocomplete: words }];
  return [
    // Ahead of the package's own theme, so these styles win.
    completionTheme,
    // The language's own sources (keywords, properties, tags) come from its language data.
    module.autocompletion({ activateOnTyping: onTyping, defaultKeymap: false }),
    EditorState.languageData.of(() => wordData),
    // CodeMirror's keys minus Option+` and Option+I, which type characters on a Mac; Tab accepts like Enter.
    Prec.highest(
      keymap.of([
        { key: "Ctrl-Space", run: module.startCompletion },
        { key: "Escape", run: module.closeCompletion },
        { key: "ArrowDown", run: module.moveCompletionSelection(true) },
        { key: "ArrowUp", run: module.moveCompletionSelection(false) },
        { key: "PageDown", run: module.moveCompletionSelection(true, "page") },
        { key: "PageUp", run: module.moveCompletionSelection(false, "page") },
        { key: "Enter", run: module.acceptCompletion },
        { key: "Tab", run: module.acceptCompletion },
      ]),
    ),
  ];
}

function extensionFor(feature: EditorFeature, kind: EditorKind, options: EditorFeatureOptions): Extension {
  if (!featureApplies(feature, kind, options)) {
    return feature === "highlightWord" ? selectionMatches : [];
  }
  if (needsAutocomplete(feature) && !autocomplete) {
    loadAutocomplete();
    return [];
  }
  switch (feature) {
    case "autoCloseBrackets":
      return autocomplete ? [autocomplete.closeBrackets(), Prec.high(keymap.of(autocomplete.closeBracketsKeymap))] : [];
    case "completion":
      return autocomplete ? completionExtension(autocomplete, options.completionOnTyping) : [];
    case "foldGutter":
      return folding;
    case "indentGuides":
      return indentGuides();
    case "highlightWord":
      return wordMatches;
    case "scrollPastEnd":
      return scrollPastEnd();
    case "columnSelection":
      return columnSelection;
    case "ruler":
      return rulerLine(options.rulerColumn);
    case "stickyScroll":
      return stickyScroll();
    case "minimap":
      return minimap();
    case "bracketPairColors":
      return bracketPairColors();
    case "matchBrackets":
      return matchingBrackets;
  }
}

function reconfigure(features: EditorFeature[]): void {
  if (!current || features.length === 0) {
    return;
  }
  const options = current;
  for (const view of views) {
    const kind = view.state.facet(kindFacet);
    view.dispatch({
      effects: features.map((feature) => compartments[feature].reconfigure(extensionFor(feature, kind, options))),
    });
  }
}

/** The feature extensions for a new editor of `kind`. */
export function editorFeatures(kind: EditorKind, options: EditorFeatureOptions): Extension {
  current ??= options;
  return [
    kindFacet.of(kind),
    registry,
    EDITOR_FEATURES.map((feature) => compartments[feature].of(extensionFor(feature, kind, options))),
  ];
}

/** Applies changed settings to every open editor, rebuilding only the features that changed. */
export function setEditorFeatures(options: EditorFeatureOptions): void {
  const previous = current;
  current = options;
  if (previous) {
    reconfigure(changedFeatures(previous, options));
  }
}
