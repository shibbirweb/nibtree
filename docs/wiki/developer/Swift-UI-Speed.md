# Swift UI speed

Every Swift component must draw faster than its web twin, and the parity gate checks it on every run (see
[Swift UI parity](Swift-UI-Parity.md)). This page explains where SwiftUI spends its time, what the components do about
it, and how the gate times both sides fairly.

## How the gate times a scenario

Each side builds, lays out and draws 200 copies of the scenario, a few times after warming up, and keeps its best time.
The web side does it in a fresh WebKit page per scenario. The Swift side runs `NibtreeShowcase --bench` once per
scenario, in its own process, for the same reason (see the bug below).

```mermaid
flowchart LR
  P["parity.ts"] --> W["WebKit page per scenario: nativeBench(200)"]
  P --> S["NibtreeShowcase --bench ... id, one process per scenario"]
  W --> V["best time each side"]
  S --> V
  V --> R["Swift must be faster"]
```

## Fewer views

SwiftUI's cost is mostly the number of views in its graph, so components keep it small:

- One `Layout` per stack that also does the padding.
- One canvas per text, and one per small component: `NKbd` is one layout and one canvas that draws the key cap and its
  text.
- Colors cached per theme, and no environment reads in `NText` (a canvas reads the palette while drawing).
- A scroll view only when the content overflows.
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
  is one: an empty `.help` cost as much as a whole `NMark`, and choosing inside the component cost almost as much.
  When the tooltip is the component's own (an `NIconButton`'s label), it is made only while the pointer is over the
  button, which already tracks hover for its color: a tooltip on every icon button cost a fifth of its time. A
  StatusIcon's tooltip is its label: a `.help` on every mark cost a row of them a third of its time, so it too is
  made only while hovered (`NHoverHelp`), which costs about half that.

The frames go further. `NMergeStackFrame` is one layout and one canvas: `NMergeStackGeometry` works out every title
strip, pane and line once, the canvas draws them and the layout places the texts, editors and handles. There are no
stacks or `GeometryReader`s in it (a `GeometryReader` rebuilds its content on every layout and cost three times the
web's time). Handles draw nothing until pointed at, so a frame or split makes them the first time the pointer enters
it and keeps them, or at once when VoiceOver is on. On macOS a split view's divider is not in the Tab order, so the
handles are adjusted with VoiceOver's increment and decrement instead of the web's arrow keys.

## The harness's own cost

The harness turns a scenario's JSON into views (`ScenarioView` and one file per library group in
`Sources/NibtreeShowcase/Parity/Groups`), and every child pays for that too:

- **Short switches.** SwiftUI makes one nested view type of all a `switch`'s cases, and every node pays for its
  depth. `ScenarioView` has one case per library group, and each group's view switches over its own components,
  so adding a component never makes the others slower. The group's switch is drawn straight into `ScenarioView`'s
  (`inner.view`), not through a view of its own: that extra view cost 3 to 5 ms in a row of six dots.
- **Children written out.** A `ForEach` gives every child its own subgraph. `ScenarioChildren` writes up to eight
  children out like a static stack's (a row of eight Spacers drew in 100 ms through `ForEach`, 85 ms written out).

Code in the app is static, like the written-out children, so the gate's Swift times are on the slow side.

## Bugs we fixed

**Stacks, splits and frames failed the speed check.** Twenty-eight scenarios (stacks with several children, splits,
merge frames, text lists) were slower than the web, and only in the full run: alone they passed.

Why: the bench ran every scenario in one process. `icon-every-name` draws every icon 200 times (almost 2 seconds and
about 440 MB), and every scenario after it ran about 1.7 times slower. Draining the autorelease pool per run did not
help: the process stays slower once it has grown.

Fix: `parity.ts` runs the bench once per scenario (`--bench <folder> <count> <warmup> <runs> <id>`), the way the web
side loads a fresh page per scenario. Each scenario is timed on its own, so one heavy scenario cannot hide or cause a
failure in another. A run takes a little longer (about four minutes in all), which is worth a fair verdict.

## Where the code lives

| File | What it does |
| --- | --- |
| `ui/swift/scripts/parity.ts` | Times both sides, one Swift process per scenario |
| `ui/swift/Sources/NibtreeShowcase/Parity/ParityRunner.swift` | `--bench`: copies, warm-ups, best run |
| `ui/swift/Sources/NibtreeShowcase/Parity/ScenarioView.swift` | The group switch and `ScenarioChildren` |
| `ui/web/src/native/` | The web side's timing list (`nativeBench`) |

## Keeping this page in sync

Update it when the timing rules change, or when a finding changes how components or the harness are built.
