import NibtreeUI
import SwiftUI

/// Stories of the split and merge frames: the handles draw only when pointed at, so each story shows a frame to drag.
extension Stories {
    static let layout: [Story] = [
        Story("SplitHandle", group: "Layout") { SplitHandleStory() },
        Story("ResizeHandle", group: "Layout") { SplitPaneStory(direction: .column) },
        Story("SplitPane", group: "Layout") { SplitPaneStory(direction: .row) },
        Story("MergeStackFrame", group: "Editor") { MergeStackStory() },
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
