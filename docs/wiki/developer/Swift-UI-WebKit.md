# Swift UI and WebKit's rules

Every Swift component must look like its web twin to at least 99% (see [Swift UI parity](Swift-UI-Parity.md)). The
web twin is drawn by WebKit, so some Swift components copy WebKit's own drawing and layout rules, not just the CSS
they were given. This page lists those rules, how each was found, and where the code lives.

## How a rule is found

When a scenario misses 99%, the parity pictures show where (`ui/swift/.parity/diff`). We then measure the web side
in WebKit itself, never guess:

```mermaid
flowchart LR
  D["diff picture"] --> P["pixel rows of both pictures"]
  D --> R["element rects and text widths in WebKit (Playwright)"]
  P --> M["a model of WebKit's rule"]
  R --> M
  M --> T["a Swift test with WebKit's numbers"]
  T --> G["the scenario passes"]
```

## The rules

**Dashed rounded borders.** A notice-style EmptyState has a `1px dashed` border with round corners. WebKit strokes the
whole outline in one go: a Core Graphics rounded rectangle (which starts halfway down the right side), 2.2 border
widths wide, dashes three widths long from phase three, clipped to the border's ring. When the dashes would not fit
the outline evenly, each gap grows a little. Drawing each side on its own put the dashes a point off.
`NEmptyState`'s `dashedBox` does what WebKit does.

**Flex shrinking.** When the Navigation Bar is narrow, the crumbs far from the file shorten first (their
`flex-shrink` is 10 to the power of the distance). CSS shares the missing width out by flex-shrink times each item's
*inner* size, its width without padding. Using the whole width left a crumb half a point off. An item never shrinks
below its `min-width`; one whose content is already narrower than that is held there from the start.
`NCrumbMath.widths` does this, and `CrumbMathTests` checks it against WebKit's numbers.

**Growing children keep their content.** A column's growing children (`flex: 1`) share its free height, but CSS
never makes one shorter than its content (`min-height: auto`): a taller one keeps its height and the rest share what
is left. `NStackLayout` gave every grower an even share, so three empty states in a column overlapped. Rows still
share evenly, because a row's children may wrap or cut their words.

**Ellipses keep the first letter.** CSS always shows a cut text's first character, with the ellipsis after it even
when that does not fit; the box then clips the ellipsis. Core Text's own cut drops to a lone ellipsis, so
`NTextEngine` keeps the first character itself.

**Centered lines.** `text-align: center` centers each wrapped line on its own, and a wrapped line's trailing space
hangs outside. `NTextEngine.draw(..., centeredIn:)` does the same for EmptyState's title and hint.

**Fixed bars.** The floating and anchored Navigation Bars are `position: fixed`, placed against the browser window,
which is wider than a scenario's frame. In a scenario, the web adapter puts them in a transformed box over the frame
(a transform makes a box the place fixed children are measured from), and the Swift harness places them with
`ScenarioFixed`. In the app, SwiftUI's caller places them with an overlay.

**Shadows past the box.** A canvas draws only inside its own bounds, so the floating bar's popup shadow is drawn by a
canvas larger than the bar by the shadow's reach.

**Form controls.** Text fields, drop-downs, checkboxes and radios have their own page:
[Swift UI form controls](Swift-UI-Controls.md).

**The cascade.** A rule's weight decides, not its place: `:hover:not(:disabled)` outranks `.active`, so a pointed-at
toggle shows the hover color even when on. Equal weights go by order, which can undo a rule: SettingRow's `.row`
padding comes after `.nested` and resets its indent, so neither side indents a nested row.

**Inheritance and margins.** An icon with no tone takes the color it sits in (a disabled row's faint icon), so `NIcon`
draws in `nibtreeCurrentColor`; a Text always sets its own color, so `NText` does not. A settings group title keeps
room above itself, less as its stack's first child: `NStackMargin` gives a child a CSS margin with a `:first-child`
value.

**Spaces between spans.** Svelte keeps the line break between two inline spans in a template as one space, which
WebKit draws: FileRow's folder sits a space plus its margin after the name. A template with no break between the
spans (SidebarRow's path) has none.

**Negative margins.** A wrapped editor tab's `margin-bottom: -1px` lays its bottom line over the row's: the tab
takes a point less room than it draws, and `NEditorTab`'s layout reports it that way.

**Baselines on the window's pixels.** WebKit puts each baseline on a whole device pixel of the window. A canvas that
draws words at a fractional spot inside itself (a centered card, a path on its name's baseline) passes that spot to
`NTextEngine.draw(..., phase:)`, so the baseline snaps where WebKit's does, not a pixel apart.

**Baselines.** A row with `align-items: baseline` lines children up on their first text line. `NText` and `NKbd` report
that baseline to the layouts around them (SwiftUI's `firstTextBaseline`), and a view without one uses its bottom, as
CSS does for an icon.

**File icons.** The app's Material and Minimal file icons are SVG files. AppKit reads SVG itself, so `NFileIcon` draws
the same files into kept bitmaps; a Minimal glyph is a mask filled with its theme color, like the web's CSS mask.

## Bugs we fixed

**Three empty states in a column overlapped.** Each one took an even share of the column, so the tallest (a big
check) spilled into the next. Why: `NStackLayout` ignored CSS's `min-height: auto`. Fix: a growing column child
keeps at least its content's height and the others share the rest, as CSS does; rows were left alone because their
children may shrink by wrapping.

**A disabled row's words were faint.** The web's stayed in the text color, and only the icon dimmed. Why: an earlier
change made `NText` with no tone take its parent's color, but the web's Text always sets `var(--text)`; the scenario
passed because the words are small. Fix: `NText` keeps its own color, and only icons inherit.

## Where the code lives

| File | What it does |
| --- | --- |
| `ui/swift/Sources/NibtreeUI/Logic/NCrumbMath.swift` | Flex shrinking with min widths |
| `ui/swift/Sources/NibtreeUI/Layout/NStackLayout.swift` | Growing children's shares |
| `ui/swift/Sources/NibtreeUI/Theme/NTextEngine.swift` | Ellipses and centered lines |
| `ui/swift/Sources/NibtreeUI/Components/NEmptyState.swift` | The dashed box |
| `ui/swift/Sources/NibtreeUI/Layout/NFileIconImages.swift` | SVG file icons into bitmaps |
| `ui/swift/Sources/NibtreeUI/Layout/NInputLook.swift`, `NTextAreaLook.swift` | Text field sizes and the grip |
| `ui/swift/Sources/NibtreeUI/Theme/NWebKitColors.swift` | WebKit's control colors and the placeholder |
| `ui/web/src/native/adapters/` | Web adapters, such as the fixed bars' box |

## Keeping this page in sync

Add a rule here when a component copies something WebKit does on its own, with how it was measured. Keep a test
with WebKit's numbers for each rule that is math.
