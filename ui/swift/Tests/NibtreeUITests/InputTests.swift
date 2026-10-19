import AppKit
import SwiftUI
import Testing

@testable import NibtreeUI

/// Input behavior the parity pictures cannot show: it rests as a drawing and becomes a text field to edit. Events go
/// to the test's own window only.
@Suite("Input")
@MainActor
struct InputTests {
    private func window(_ view: some View) -> NSWindow {
        let window = NSWindow(
            contentRect: CGRect(x: 0, y: 0, width: 300, height: 80), styleMask: [.titled], backing: .buffered,
            defer: false)
        window.contentView = NSHostingView(rootView: view.frame(width: 300, height: 80))
        window.contentView?.layoutSubtreeIfNeeded()
        return window
    }

    private func hasTextField(_ view: NSView) -> Bool {
        view is NSTextField || view.subviews.contains { hasTextField($0) }
    }

    private func settle() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    @Test("an input at rest is a drawing, with no AppKit text field")
    func rests() {
        let window = window(NInput(value: .constant("main")))
        settle()
        #expect(!hasTextField(window.contentView!))
    }

    @Test("while editing it is SwiftUI's own text field")
    func edits() {
        let window = window(NInput(value: .constant("main"), editing: true))
        settle()
        #expect(hasTextField(window.contentView!))
    }

    @Test("Return and printable keys start editing; Tab, arrows and Escape go on to the window")
    func keys() {
        #expect(NInput.startsEditing("", isReturn: true))
        #expect(NInput.startsEditing("a", isReturn: false))
        #expect(NInput.startsEditing(" ", isReturn: false))
        #expect(!NInput.startsEditing("\t", isReturn: false))
        #expect(!NInput.startsEditing("\u{1B}", isReturn: false))
        #expect(!NInput.startsEditing("\u{F700}", isReturn: false))
        #expect(!NInput.startsEditing("", isReturn: false))
    }
}

