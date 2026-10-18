import AppKit
import SwiftUI
import Testing

@testable import NibtreeUI

/// Stack behavior the parity pictures cannot show: whether a scrolling region gets a scroll view.
@Suite("Stack")
@MainActor
struct StackTests {
    private func hosted(_ view: some View, width: Double, height: Double) -> NSView {
        let host = NSHostingView(rootView: view.frame(width: width, height: height, alignment: .topLeading))
        host.frame = CGRect(x: 0, y: 0, width: width, height: height)
        host.layoutSubtreeIfNeeded()
        return host
    }

    private func hasScrollView(_ view: NSView) -> Bool {
        view is NSScrollView || view.subviews.contains { hasScrollView($0) }
    }

    private func rows(_ count: Int) -> some View {
        NStack(gap: .xs, scroll: .y) {
            ForEach(0..<count, id: \.self) { row in
                NText("Row \(row)")
            }
        }
    }

    @Test("a scroll region that fits draws as a plain stack")
    func fitsWithoutScrollView() {
        #expect(!hasScrollView(hosted(rows(2), width: 200, height: 300)))
    }

    @Test("a scroll region taller than its space scrolls")
    func overflowScrolls() {
        #expect(hasScrollView(hosted(rows(40), width: 200, height: 100)))
    }
}
