import AppKit
import SwiftUI
import Testing

@testable import NibtreeUI

/// RenameField behavior the parity pictures cannot show: it becomes a focused text field with the name selected, and
/// Return, Escape or leaving it ends the rename once. Events go to the test's own window only.
extension Windowed {
    @Suite("RenameField")
    @MainActor
    struct RenameFieldTests {
        /// What `onRename` got, in order.
        private final class Calls {
            var names: [String?] = []
        }

        private func window(_ view: some View) -> NSWindow {
            let window = NSWindow(
                contentRect: CGRect(x: 0, y: 0, width: 300, height: 60), styleMask: [.titled], backing: .buffered,
                defer: false)
            window.contentView = NSHostingView(rootView: view.frame(width: 300, height: 60))
            window.contentView?.layoutSubtreeIfNeeded()
            // Shown (SwiftUI only runs `onAppear` in a window on screen), but clear and far off the screens.
            window.alphaValue = 0
            window.setFrameOrigin(CGPoint(x: -20000, y: -20000))
            window.orderFrontRegardless()
            return window
        }

        /// Lets the main queue run (a nested run loop would not: the test itself holds the main queue).
        private func settle() async throws {
            try await Task.sleep(for: .milliseconds(300))
        }

        /// Sends a key's command (Return's `insertNewline:`, Escape's `cancelOperation:`) to the field's editor, as
        /// AppKit does for the key.
        private func command(_ selector: Selector, in window: NSWindow) async throws {
            (window.firstResponder as? NSTextView)?.doCommand(by: selector)
            try await settle()
        }

        @Test("the kept name is trimmed; a cancel or only spaces keeps nothing")
        func kept() {
            #expect(NRenameField.kept("  zsh 3 ") == "zsh 3")
            #expect(NRenameField.kept("   ") == nil)
            #expect(NRenameField.kept(nil) == nil)
        }

        @Test("once on screen it is a focused text field with the whole name selected")
        func focused() async throws {
            let window = window(NRenameField(value: "zsh 2") { _ in })
            defer { window.orderOut(nil) }
            try await settle()
            let editor = window.firstResponder as? NSTextView
            #expect(editor?.string == "zsh 2")
            #expect(editor?.selectedRange() == NSRange(location: 0, length: 5))
        }

        @Test("Return keeps the name, and a later Escape does not count")
        func returnKeeps() async throws {
            let calls = Calls()
            let window = window(NRenameField(value: " zsh 2 ") { calls.names.append($0) })
            defer { window.orderOut(nil) }
            try await settle()
            try await command(#selector(NSResponder.insertNewline(_:)), in: window)
            try await command(#selector(NSResponder.cancelOperation(_:)), in: window)
            #expect(calls.names == ["zsh 2"])
        }

        @Test("Escape cancels")
        func escapeCancels() async throws {
            let calls = Calls()
            let window = window(NRenameField(value: "zsh 2") { calls.names.append($0) })
            defer { window.orderOut(nil) }
            try await settle()
            try await command(#selector(NSResponder.cancelOperation(_:)), in: window)
            #expect(calls.names == [nil])
        }
    }
}
