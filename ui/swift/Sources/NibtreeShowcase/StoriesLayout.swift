import NibtreeUI
import SwiftUI

/// Stories of the split and merge frames: the handles draw only when pointed at, so each story shows a frame to drag.
extension Stories {
    static let layout: [Story] = [
        Story("SplitHandle", group: "Layout") { SplitHandleStory() },
        Story("ResizeHandle", group: "Layout") { SplitPaneStory(direction: .column) },
        Story("SplitPane", group: "Layout") { SplitPaneStory(direction: .row) },
        Story("MergeStackFrame", group: "Editor") { MergeStackStory() },
        Story("ZoomBar", group: "Editor") {
            NStack(direction: .row, gap: .xs, align: .center) {
                NZoomBar(zoom: .constant(nil), fitted: 0.42)
            }
        },
        Story("HighlightText", group: "Editor") {
            NStack(gap: .xs) {
                NHighlightText(text: "CartItems.svelte", ranges: [0..<4, 8..<9])
                NHighlightText(text: "const total = items.reduce(sum)", ranges: [6..<11], variant: .mark)
                NHighlightText(text: "Show line numbers", ranges: [5..<9], variant: .search)
            }
        },
        Story("Grid", group: "Layout") {
            NGrid(columns: .three, gap: .sm) {
                ForEach(["main", "dev", "release", "hotfix", "docs"], id: \.self) { NTag($0) }
            }
            .frame(width: 360)
        },
        Story("DescriptionList", group: "Layout") {
            NDescriptionList(items: [
                NDescriptionItem(label: "Author", value: "Ada Lovelace"),
                NDescriptionItem(label: "Parents", value: "a1b2c3d", mono: true),
            ])
            .frame(width: 300)
        },
        Story("PanelHeader", group: "Layout") {
            NPanelHeader(title: "Changes", count: 12) {
                NIconButton(icon: .refresh, label: "Refresh", size: .compact) {}
                NIconButton(icon: .more, label: "More", size: .compact) {}
            }
            .frame(width: 320)
        },
        Story("Pane", group: "Layout") {
            NStack(direction: .row, gap: .none) {
                NPane(label: "Versions", width: .small) {
                    NStack(paddingX: .lg, paddingY: .xs) { NText("Today 10:24") }
                    NStack(paddingX: .lg, paddingY: .xs) { NText("Yesterday") }
                }
                NStack(padding: .md, grow: true) { NText("The version's text") }
            }
            .frame(width: 420, height: 140)
        },
        Story("Card", group: "Layout") {
            NStack(gap: .sm) {
                NCard(label: "main worktree", padded: true, selected: true) {
                    NStack(gap: .xs) {
                        NText("main", variant: .label)
                        NText("~/code/nibtree", tone: .dim)
                    }
                }
                NCard(label: "old worktree", dim: true) {
                    NStack(paddingX: .lg, paddingY: .xs) { NText("feature/gone") }
                }
            }
        },
        Story("TreeLine", group: "Layout") {
            NStack {
                ForEach(NTreeLine.Position.allCases, id: \.self) { position in
                    NStack(direction: .row, gap: .sm, align: .center) {
                        NTreeLine(position: position)
                        NText("zsh \(position.rawValue)")
                    }
                }
            }
        },
        Story("Time", group: "Layout") {
            NStack(gap: .xs) {
                NTime(time: Date().addingTimeInterval(-300)).help(NTimeText.fullDate(Date()))
                NTime(time: Date().addingTimeInterval(-7200), format: .age) { NText($0, tone: .dim, tabular: true) }
                NTime(time: Date().addingTimeInterval(12_000), format: .until) {
                    NText("Resets \($0)", tone: .dim, tabular: true)
                }
            }
        },
    ]
}

private struct SplitHandleStory: View {
    @State private var ratio = 0.5

    var body: some View {
        NStack(gap: .sm) {
            NText("Drag the line between the halves, or double-click it: \(Int(ratio * 100))%", tone: .dim)
            HStack(spacing: 0) {
                pane("Left").frame(width: 360 * ratio)
                pane("Right")
            }
            .frame(width: 360, height: 120)
            .overlay { NSplitHandle(ratio: $ratio, label: "Resize the halves") }
        }
    }

    private func pane(_ text: String) -> some View {
        NStack(padding: .sm, surface: .alt) { NText(text) }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct SplitPaneStory: View {
    let direction: NSplitDirection
    @State private var size = 120.0

    var body: some View {
        NSplitPane(direction: direction, size: $size, max: 260, label: "Resize the panes") {
            NStack(padding: .sm) { NText("First, \(Int(size)) points") }
        } second: {
            NStack(padding: .sm) { NText("Second takes the rest", tone: .dim) }
        }
        .frame(width: 360, height: 220)
    }
}

private struct MergeStackStory: View {
    @State private var topHeight = 0.0
    @State private var ratio = 0.5

    var body: some View {
        NMergeStackFrame(
            label: "Merge server.ts", labels: NMergeLabels(left: "Yours: main", right: "Theirs: feature"),
            fileName: "server.ts", topHeight: $topHeight, ratio: $ratio
        ) {
            NText("const port = 3000;", mono: true)
        } result: {
            NText("const port = 8080;", mono: true)
        } right: {
            NText("const port = 8080;", mono: true)
        } resultEnd: {
            NText("1 conflict", tone: .danger, size: .small)
        }
        .frame(width: 520, height: 320)
    }
}
