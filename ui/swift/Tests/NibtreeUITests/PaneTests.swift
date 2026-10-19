import AppKit
import SwiftUI
import Testing

@testable import NibtreeUI

/// Pane behavior the parity pictures cannot show (a scroll view is not drawn by an image renderer): whether a pane
/// that is too short scrolls, and its set width.
@Suite("Pane")
@MainActor
struct PaneTests {
    private func hosted(rows count: Int, height: Double) -> NSView {
        let pane = NPane(label: "Versions", width: .small) {
            ForEach(0..<count, id: \.self) { row in
                NText("Version \(row)")
            }
        }
        let host = NSHostingView(rootView: pane.frame(height: height, alignment: .topLeading))
        host.frame = CGRect(x: 0, y: 0, width: 400, height: height)
        host.layoutSubtreeIfNeeded()
        return host
    }

    private func hasScrollView(_ view: NSView) -> Bool {
        view is NSScrollView || view.subviews.contains { hasScrollView($0) }
    }

    @Test("a pane whose rows fit draws without a scroll view")
    func fits() {
        #expect(!hasScrollView(hosted(rows: 2, height: 300)))
    }

    @Test("a pane taller than its room scrolls")
    func overflowScrolls() {
        #expect(hasScrollView(hosted(rows: 40, height: 100)))
    }

    @Test("the pane is as wide as its column width, whatever is on offer")
    func width() {
        let pane = NPane(label: "Versions", width: .small) { NText("One") }
        let host = NSHostingView(rootView: pane)
        #expect(host.fittingSize.width == NColumnWidth.small.points)
    }
}
