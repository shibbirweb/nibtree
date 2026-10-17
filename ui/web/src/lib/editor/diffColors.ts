// Red and green diff colors by side, for diffs that color the old side red and the new side green instead of by
// kind (diffTheme): the side by side diff (`sideColors`) and the three-pane diffs (`toneColors`).
import { EditorView } from "@codemirror/view";

/**
 * The two-pane diff's colors: changed lines red on the old side and green on the new,
 * with stronger tints on the changed words. The three-pane views use `toneColors`.
 */
export const sideColors = [
  EditorView.editorAttributes.of({ class: "cm-sideColors" }),
  EditorView.theme({
    "&.cm-sideColors.cm-merge-a .cm-content .cm-line.cm-changedLine": {
      backgroundColor: "var(--diff-removed)",
    },
    "&.cm-sideColors.cm-merge-b .cm-content .cm-line.cm-changedLine": {
      backgroundColor: "var(--diff-added)",
    },
    "&.cm-sideColors.cm-merge-a .cm-content .cm-line .cm-changedText": {
      background: "var(--diff-removed-word)",
    },
    "&.cm-sideColors.cm-merge-b .cm-content .cm-line .cm-changedText": {
      background: "var(--diff-added-word)",
    },
    // A whole removed or added line already has its color; only modified lines mark their words.
    "&.cm-sideColors.cm-merge-a .cm-content .cm-diffDeleted .cm-changedText": {
      background: "none",
    },
    "&.cm-sideColors.cm-merge-b .cm-content .cm-diffAdded .cm-changedText": {
      background: "none",
    },
    "&.cm-sideColors.cm-merge-a .cm-gutters .cm-changedLineGutter": {
      background: "var(--danger)",
    },
    "&.cm-sideColors.cm-merge-b .cm-gutters .cm-changedLineGutter": {
      background: "var(--diff-added-edge)",
    },
  }),
];

/**
 * The three-pane diff's colors, like `sideColors`: a change is red where it is older and green where it is newer
 * (the marks' tone from threeWay.ts). A merge commit's conflicts keep their color.
 */
export const toneColors = [
  EditorView.editorAttributes.of({ class: "cm-toneColors" }),
  EditorView.theme({
    // .cm-line makes these win over the kind edges (.cm-mc-line.cm-mc-modified, .cm-mc-edge-modified).
    "&.cm-toneColors .cm-line.cm-mc-old": { "--mc-edge": "var(--danger)" },
    "&.cm-toneColors .cm-line.cm-mc-new": { "--mc-edge": "var(--diff-added-edge)" },
    "&.cm-toneColors .cm-mc-line.cm-mc-old": { backgroundColor: "var(--diff-removed)" },
    "&.cm-toneColors .cm-mc-line.cm-mc-new": { backgroundColor: "var(--diff-added)" },
    "&.cm-toneColors .cm-mc-inline-old": { backgroundColor: "var(--diff-removed-word)" },
    "&.cm-toneColors .cm-mc-inline-new": { backgroundColor: "var(--diff-added-word)" },
  }),
];
