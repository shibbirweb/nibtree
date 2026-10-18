# Swift UI speed

Every Swift component must draw faster than its web twin, and the parity gate checks it on every run (see
[Swift UI parity](Swift-UI-Parity.md)). This page explains where SwiftUI spends its time and what the components do
about it. How the gate times both sides, and what its own harness costs, is in [Swift UI bench](Swift-UI-Bench.md).

## Fewer views

SwiftUI's cost is mostly the number of views in its graph, so components keep it small:

- One `Layout` per stack that also does the padding.
- One canvas per text, and one per small component: `NKbd` is one layout and one canvas that draws the key cap and its
  text. A Chip draws a still status mark in its own canvas too; only a spinner is a view of its own.
- Colors cached per theme, and no environment reads in `NText` or `NStack` (a canvas reads the palette while drawing).
- Selectable text is drawn like other text and becomes SwiftUI's selectable `Text` once the pointer is over it: that
  `Text` cost twice the drawn one.
- A scroll view only when the content overflows.
- One clock for every live `NTime`, as on the web: a `TimelineView` each cost a lone time a fifth of its drawing.
- No `if` in a component's body for an option most uses leave off: each one cost a row of six `NStatusDot`s 3 to
  5 ms. An animation is the caller's modifier too: a running dot is `NStatusDot(...).nibtreePulse()`, so the
  dots that stay still pay neither the branch nor the pulse's state (8% on a row of dots).
- No layout when nothing shows it. A StatusLetter is one canvas in a fixed frame: a row stretches the web's span,
  but it draws nothing there, and dropping the layout made a row of letters 8% faster.
- One `accessibilityRepresentation` (a real `Toggle` for `NSwitch`) instead of five accessibility modifiers: 5%
  faster on a row of switches, and VoiceOver reads a switch.
- A control's words in the control's own canvas. `NCheckbox` with a plain label is one layout and one canvas that
  draws the box and the words; a stack, a box canvas and an `NText` took a column of six checkboxes from 100 ms to
  227 ms, where the web took 164.
- No tooltip inside a component. A web `title` is SwiftUI's own `.help("...")`, added by the caller only when there
  is one: an empty `.help` cost as much as a whole `NMark`. When the tooltip is the component's own (an
  `NIconButton`'s or a StatusIcon's label), it is made only while the pointer is over it (`NHoverHelp`): a `.help` on
  every mark cost a row of them a third of its time.

The frames go further. `NMergeStackFrame` is one layout and one canvas: `NMergeStackGeometry` works out every title
strip, pane and line once, the canvas draws them and the layout places the texts, editors and handles. There are no
stacks or `GeometryReader`s in it (a `GeometryReader` rebuilds its content on every layout and cost three times the
web's time). Handles draw nothing until pointed at, so a frame or split makes them the first time the pointer enters
it and keeps them, or at once when VoiceOver is on. On macOS a split view's divider is not in the Tab order, so the
handles are adjusted with VoiceOver's increment and decrement instead of the web's arrow keys.

## Where the code lives

| File | What it does |
| --- | --- |
| `ui/swift/Sources/NibtreeUI/Components/` | One `N<Name>.swift` per component, each kept to few views |
| `ui/swift/Sources/NibtreeUI/Theme/NHoverHelp.swift` | A component's own tooltip, made only while pointed at |
| `ui/swift/Sources/NibtreeUI/Layout/NMergeStackLayout.swift` | A merge frame's strips, panes and lines |

## Keeping this page in sync

Update it when a finding changes how components are built.
