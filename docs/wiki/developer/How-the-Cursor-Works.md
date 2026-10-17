# How the Cursor Works

The editors' cursor can change its shape, width, blinking and height (how far it reaches above and below the line). The user side is in [Editing Code](../usage/Code-Appearance.md#the-cursor).

## Why we need it

People have strong habits about the cursor. A thin line is easy to lose on a big screen; a block or a taller caret is easier to find. The settings cost nothing while unchanged: they are a small theme in one compartment.

## How it works

CodeMirror's `drawSelection` draws each cursor as a `.cm-cursor` element inside the `.cm-cursorLayer`, positioned and sized inline by CodeMirror, and blinks the whole layer with its `cm-blink` animation. `cursor.ts` styles those elements instead of drawing its own.

The selection is drawn: soft corners on the outside of the shape. CodeMirror draws a selection as up to three boxes (the first line, the full lines between, the last line). `drawRoundedSelection` in the UI library keeps `drawSelection` for the cursors but swaps its selection layer for one of its own (same `cm-selectionLayer` class, so each editor still has one), which draws the same boxes, each with a class for every corner that sits on the outside. A corner is square when the box above or below carries on past it, so the joins have no notches. The radius is the `codeEditor.selectionRadius` design token, and the color is still the theme's `--editor-selection` (a soft gray in Light and Islet Light).

```mermaid
flowchart LR
  S["settings: editorCursor*, editorCaretExtra*"] --> O["cursorOptions"]
  O --> T["cursorThemeSpec: pure, tested"]
  T --> C["EditorView.theme, cached per options"]
  C --> K["compartment in every editor"]
  A["App.svelte effect"] -->|"setEditorCursor"| K
  P["cursorTracker ViewPlugin"] -->|"--gm-char-width, data-gm-blink"| D["the editor's scroller"]
```

- **Shape.** Line styles use `border-left` (the width, or 1 px for Line thin) with a negative half-width margin so the line sits in the gap between characters. Block, Block outline and the underlines are one character wide, from `--gm-char-width`. A block is filled with the cursor color at 55%, so the character under it stays readable in every theme; Block outline uses an inset `outline` so the size does not change.
- **Extra height.** CodeMirror sets the element's height inline. Padding on top and bottom, with `box-sizing: content-box`, makes the element taller than that height, and a negative top margin moves it up by the extra top. The border, fill or outline covers the padding.
- **Blinking.** The theme turns the layer's animation off (`animation: none !important`, which beats CodeMirror's inline animation name) and animates each cursor with keyframes named after the mode. Blink is `steps(1)` over 1.2 s, CodeMirror's rate, and turns `visibility` off and on rather than `opacity`, which would give the cursor a GPU layer of its own; Smooth, Phase and Expand use eased frames over 0.6 s, alternating. Solid adds no animation.
- **Restart on move.** The cursor stays visible while you type. Each mode has two identical keyframe copies, `-a` and `-b`. `cursorTracker` flips `data-gm-blink` on the scroller after every selection or document change, so the other copy starts from its first, visible frame.
- **Character width.** `cursorTracker` writes `view.defaultCharacterWidth` to `--gm-char-width` on the scroller when the editor is created and when its geometry changes, for example after a font size change.
- **Smooth caret.** A short `left` and `top` transition. CodeMirror reuses the cursor element when only its position changes, so the transition plays.
- **Live changes.** `editorCursor` adds a registry plugin and a compartment, like `whitespace.ts`. The effect in `App.svelte` calls `setEditorCursor`, which reconfigures the compartment in every open editor.

## Where the code lives

| File | What it does |
| --- | --- |
| `src/lib/editor/cursor.ts` | `cursorOptions`, `cursorTracker`, `editorCursor`, `setEditorCursor` |
| `ui/web/src/lib/editor/cursorStyle.ts` | `cursorThemeSpec`: every shape and blink as styles (the library) |
| `src/lib/editor/setup.ts` | Adds `editorCursor(cursorOptions(settings))` and `drawRoundedSelection()` to every editor, diff and merge pane |
| `ui/web/src/lib/editor/selection.ts` | `drawRoundedSelection` and `outerCorners`, also used by the library's `CodeEditor` |
| `src/lib/App.svelte` | The effect that applies changed cursor settings |
| `src/lib/stores/settingsData.ts` | The six keys, their choices, ranges and validation |
| `src/lib/views/settings/EditorTextSettings.svelte` | The rows in Settings, Editor |

## Design decisions

**Style CodeMirror's cursor, do not replace it.** CodeMirror already places cursors for every selection range, bidirectional text and wrapped lines. Drawing our own would repeat that work and its bugs.

**Round only the outer corners.** Rounding every box would cut a notch wherever two boxes meet. `outerCorners` works from the boxes' positions, so it holds for wrapped lines and several selections too.

**Use the default character width.** A block over a wide character, such as a tab, is one normal character wide. Measuring the character under every cursor would cost a layout read on each move for a small gain with monospace fonts.

**Write to the scroller, not the editor root.** CodeMirror rewrites the root's `class` from its attributes facet, which would drop a class we set by hand. The scroller is never rewritten, so the data attribute and the variable stay.

**Cache one theme per set of options.** Each `EditorView.theme` adds style rules to the page. Dragging a slider back and forth reuses the cached themes instead of adding new rules each time.

**A default of 2 px.** The old fixed cursor was about 1.2 px. Line thin keeps a thin cursor for anyone who prefers it.

## Tests

- `ui/web/src/lib/editor/cursorStyle.test.ts`: each shape, the width and thin styles, the extra height, smooth movement, the layer blink turned off, the two keyframe copies and each blinking mode.
- `ui/web/src/lib/editor/selection.test.ts`: which corners are rounded for one line, three boxes, lines that only touch at a point, lines that overlap and boxes a pixel apart.
- `src/lib/stores/settingsData.test.ts`: defaults and the clamping of hand-edited cursor values.

How the cursor looks needs a visual check in the app.

## Keeping this page in sync

- Update this page and [Editing Code](../usage/Code-Appearance.md#the-cursor) when a cursor setting or its behavior changes.
- Update [Settings Reference](Settings-Reference.md) when a key, default or range changes.

## Bugs we fixed

**The selection and the inline blame floated after a font size change.**
- **The issue:** with text selected, Zoom In or Zoom Out (or a font setting) moved the text, but the selection and the inline blame stayed where the old lines were, above or below their line.
- **Why it happened:** font settings are CSS variables on the page. CodeMirror measures line heights only after its own updates or when the editor box resizes, and a new font size changes neither, so every layer kept the old positions until the next scroll.
- **The fix and why we chose it:** `remeasureEditors` (in `cursor.ts`, which already keeps the set of open editors) asks each one to measure again, from an effect in `editorSettingsSync.svelte.ts` that follows the font size, line spacing, font, weight and ligatures. One measure per editor per change, instead of watching every editor's size all the time.
