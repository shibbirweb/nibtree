// Bracket pair colors: each pair of
// brackets gets a color by how deep it is nested. Only the lines on screen are colored.
// Brackets come from the syntax tree, so the ones inside strings and comments are skipped,
// and the depth at the top of the screen comes from the bracketed nodes around it, so
// nothing above the screen is scanned. Languages without a real grammar (legacy modes)
// scan a bounded stretch of text above the screen instead.

import { language, StreamLanguage, syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { BRACKET_LEVELS, bracketCandidates, colorBrackets, isOpenBracket } from "./bracketDepth";
import { bracketColorTheme } from "@nibtree/ui/editor/guideThemes";

// @lezer/common is not a direct dependency; its types come through @codemirror/language.
type Tree = ReturnType<typeof syntaxTree>;
type SyntaxNode = ReturnType<Tree["resolveInner"]>;

/** How far above the screen a legacy mode looks for brackets that are still open. */
const STREAM_LOOKBACK = 10_000;

const SKIPPED_STREAM_TOKENS = /string|comment|regexp/i;

const marks = Array.from({ length: BRACKET_LEVELS }, (_unused, level) =>
  Decoration.mark({ class: `cm-gm-bracket-${level + 1}` }),
);
const unmatched = Decoration.mark({ class: "cm-gm-bracket-unmatched" });

/** A bracket node of a real grammar is named after its character ("(", "}"...). */
function grammarBracket(tree: Tree, from: number, char: string): boolean {
  const node = tree.resolveInner(from, 1);
  return node.from === from && node.name === char;
}

/** Legacy modes name their tokens by style, so only strings and comments are left out. */
function streamBracket(tree: Tree, from: number): boolean {
  return !SKIPPED_STREAM_TOKENS.test(tree.resolveInner(from, 1).name);
}

/** Brackets opened before `from` and still open there, counted from the nodes around it. */
export function openBracketsAt(tree: Tree, from: number): number {
  let depth = 0;
  for (let node: SyntaxNode | null = tree.resolveInner(from, 1); node; node = node.parent) {
    const first = node.firstChild;
    if (first && first.from < from && first.to <= from && isOpenBracket(first.name) && node.to > from) {
      depth++;
    }
  }
  return depth;
}

/** Bracket decorations for the visible ranges of a state. */
export function bracketDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
): DecorationSet {
  const tree = syntaxTree(state);
  const builder = new RangeSetBuilder<Decoration>();
  if (tree.length === 0) {
    return builder.finish();
  }
  const stream = state.facet(language) instanceof StreamLanguage;
  for (const range of visibleRanges) {
    const scanFrom = stream ? state.doc.lineAt(Math.max(0, range.from - STREAM_LOOKBACK)).from : range.from;
    const tokens = bracketCandidates(state.doc.sliceString(scanFrom, range.to), scanFrom).filter((token) =>
      stream ? streamBracket(tree, token.from) : grammarBracket(tree, token.from, token.char),
    );
    const startDepth = stream ? 0 : openBracketsAt(tree, range.from);
    for (const bracket of colorBrackets(tokens, startDepth)) {
      if (bracket.from >= range.from) {
        builder.add(bracket.from, bracket.from + 1, bracket.level < 0 ? unmatched : marks[bracket.level]);
      }
    }
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = bracketDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = bracketDecorations(update.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (instance) => instance.decorations },
);

export function bracketPairColors(): Extension {
  return [plugin, bracketColorTheme];
}
