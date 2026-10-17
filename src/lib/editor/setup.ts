// Shared CodeMirror configuration. Languages are loaded on demand so only the
// grammars actually used end up in memory.

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { drawRoundedSelection } from "@nibtree/ui/editor/selection";
import { editorTheme as libraryEditorTheme } from "@nibtree/ui/editor/theme";
import { settings } from "$lib/stores/settings.svelte";
import { commandKeys } from "./commandKeys";
import { codeKeymap } from "./editorCommands";
import { findBar } from "./findPanel.svelte";
import { codeHighlighters } from "@nibtree/ui/editor/highlighter";
import { highlightActiveLineWhenEmpty } from "./activeLine";
import { cursorOptions, editorCursor } from "./cursor";
import { type EditorKind, featureOptions } from "./featurePlan";
import { editorFeatures } from "./features";
import { indentation } from "./indentation";
import { renderWhitespace } from "./whitespace";
import { panelTheme } from "@nibtree/ui/editor/panelThemes";

export const editorTheme: Extension = [libraryEditorTheme, panelTheme];

export interface EditorOptions {
  readOnly?: boolean;
  /** Which IDE features apply (features.ts); editable panes default to the file editor, read-only ones to a diff side. */
  kind?: EditorKind;
  /** Extra extensions appended after the defaults. */
  extensions?: Extension[];
  /** False when the editor draws its own numbers (the inline diff shows old and new ones). */
  lineNumbers?: boolean;
}

export function baseExtensions({
  readOnly = false,
  kind,
  extensions = [],
  lineNumbers: numbered = true,
}: EditorOptions = {}): Extension[] {
  const common: Extension[] = [
    numbered ? lineNumbers() : [],
    highlightSpecialChars(),
    drawRoundedSelection(),
    ...codeHighlighters.map((highlighter) => syntaxHighlighting(highlighter)),
    // Auto-close, completion, folding, guides, word highlight, margin line, sticky scroll,
    // minimap, bracket colors and matching... each switchable in Settings.
    editorFeatures(kind ?? (readOnly ? "diff" : "file"), featureOptions(settings)),
    // Select All Occurrences and Cmd+D add carets; Option+Shift+click adds one.
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey && event.shiftKey),
    findBar(),
    renderWhitespace(settings.renderWhitespace),
    editorCursor(cursorOptions(settings)),
    editorTheme,
    // The file's own indentation, or the Tab size setting; open editors follow both settings.
    indentation({ detect: settings.detectIndentation, tabSize: settings.tabSize }),
    // Custom keys from Settings > Keyboard Shortcuts, ahead of every default key.
    commandKeys(),
    // The Code menu's keys (Duplicate, Join Lines, Toggle Case...), ahead of the defaults.
    keymap.of(codeKeymap),
    keymap.of(defaultKeymap),
  ];
  if (readOnly) {
    return [...common, EditorState.readOnly.of(true), ...extensions];
  }
  return [
    ...common,
    history(),
    indentOnInput(),
    highlightActiveLineWhenEmpty(),
    highlightActiveLineGutter(),
    keymap.of([...historyKeymap, indentWithTab]),
    ...extensions,
  ];
}

// Languages live in languages.ts; re-exported so the editors keep one import.
export { editorLanguage, grammarFor, languageFor, languageName } from "./languages";
