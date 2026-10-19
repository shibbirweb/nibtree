import AppKit
import NibtreeTokens
import SwiftUI
import Testing

@testable import NibtreeUI

/// SearchField.svelte's width rules, and behavior the parity pictures cannot show. Windows are the test's own, shown
/// clear and off the screens.
extension Windowed {
    @Suite("SearchField")
    @MainActor
    struct SearchFieldTests {
        private func look(size: NSearchFieldSize = .normal, width: NControlWidth = .auto) -> NSearchFieldLook {
            NSearchFieldLook(placeholder: "Search", label: "Search", size: size, width: width)
        }

        @Test("a field takes the width on offer, a preset's, or WebKit's own with nothing on offer")
        func widths() {
            #expect(look().width(offer: 300, clearing: false) == 300)
            #expect(look(width: .medium).width(offer: 300, clearing: false) == GMControlWidth.medium)
            let natural = look().width(offer: nil, clearing: false)
            let clearing = look().width(offer: nil, clearing: true)
            let clearRoom: CGFloat = GMSearchFieldTokens.gap + look().clearSide
            #expect(clearing - natural == clearRoom)
        }

        @Test("the small size has its own width, at most half of the room, even with a preset")
        func small() {
            let half: CGFloat = 400 * NSearchFieldLook.smallShare
            #expect(look(size: .small).width(offer: 1000, clearing: false) == GMSearchFieldTokens.smallWidth)
            #expect(look(size: .small).width(offer: 400, clearing: false) == half)
            #expect(look(size: .small, width: .large).width(offer: 400, clearing: false) == half)
            #expect(look(size: .small, width: .fill).width(offer: 400, clearing: false) == half)
        }

        @Test("the compact and small clear buttons are the token square; the others hug their icon")
        func clearSide() {
            #expect(look(size: .compact).clearSide == GMSearchFieldTokens.clearSize)
            let hugged: CGFloat = NIconSize.compact.points + 2 * GMSpace.s1
            #expect(look().clearSide == hugged)
        }

        private func window(_ view: some View) -> NSWindow {
            let window = NSWindow(
                contentRect: CGRect(x: 0, y: 0, width: 300, height: 60), styleMask: [.titled], backing: .buffered,
                defer: false)
            window.contentView = NSHostingView(rootView: view.frame(width: 300, height: 60))
            window.alphaValue = 0
            window.setFrameOrigin(CGPoint(x: -20000, y: -20000))
            window.orderFrontRegardless()
            return window
        }

        private func hasTextField(_ view: NSView) -> Bool {
            view is NSTextField || view.subviews.contains { hasTextField($0) }
        }

        @Test("at rest it is a drawing; autofocus makes it a text field once on screen")
        func autofocus() async throws {
            let resting = window(NSearchField(value: .constant(""), label: "Search"))
            let focused = window(NSearchField(value: .constant(""), label: "Search", autofocus: true))
            defer {
                resting.orderOut(nil)
                focused.orderOut(nil)
            }
            try await Task.sleep(for: .milliseconds(300))
            #expect(!hasTextField(resting.contentView!))
            #expect(hasTextField(focused.contentView!))
        }
    }
}
