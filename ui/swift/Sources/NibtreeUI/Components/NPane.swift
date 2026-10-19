import NibtreeTokens
import SwiftUI

/// The side of a view a pane sits on; its line is on the side that meets the content.
public enum NPaneSide: String, CaseIterable, Sendable {
    case left, right
}

/// A pane's line: `strong`, or `soft` like the welcome screen's sidebar.
public enum NPaneLine: String, CaseIterable, Sendable {
    case strong, soft
}

/// A side column inside a view or dialog, such as Local History's list of versions: the Swift side of ui/web `Pane`
/// (docs/components/Pane.md). A set width, a tinted background, a line on the side it meets the content, and its own
/// scroll when the content is taller than the room (a scroll view only then, like the web's `overflow-y: auto`).
/// Its children stack as a column, each as wide as the pane.
public struct NPane<Content: View>: View {
    private let label: String
    private let width: NColumnWidth
    private let side: NPaneSide
    private let line: NPaneLine
    private let content: Content

    public init(
        label: String, width: NColumnWidth = .large, side: NPaneSide = .left, line: NPaneLine = .strong,
        @ViewBuilder content: () -> Content
    ) {
        self.label = label
        self.width = width
        self.side = side
        self.line = line
        self.content = content()
    }

    public var body: some View {
        // The line is a CSS border: inside the set width, so the children have a point less.
        let insets = EdgeInsets(
            top: GMPaneTokens.paddingTop, leading: side == .right ? 1 : 0, bottom: GMPaneTokens.paddingBottom,
            trailing: side == .left ? 1 : 0)
        let layout = NStackLayout(axis: .vertical, spacing: 0, align: .stretch, justify: .start, insets: insets)
        let (side, line) = (side, line)
        ViewThatFits(in: .vertical) {
            layout { content }
            ScrollView(.vertical) { layout { content } }
        }
        .frame(width: width.points)
        .background {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    context.withCGContext { cg in
                        cg.setFillColor(palette.cgColor(.panelAlt))
                        cg.fill(CGRect(origin: .zero, size: size))
                        cg.setFillColor(palette.cgColor(line == .soft ? .border : .borderStrong))
                        cg.fill(CGRect(x: side == .left ? size.width - 1 : 0, y: 0, width: 1, height: size.height))
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}
