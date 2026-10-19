import AppKit
import SwiftUI

/// A tooltip that costs a view only a hover watch: a `.help` on every mark of a row cost the row a third of its time,
/// and a `.help` made only while hovered still cost a row of ref labels a fifth. While the pointer is over the view,
/// the AppKit view under it carries the text as its own tooltip, which AppKit shows as it would any other.
struct NHoverHelp: ViewModifier {
    let text: String

    func body(content: Content) -> some View {
        let text = text
        return content.onHover { inside in
            if inside {
                NHoverHelpHost.show(text)
            } else {
                NHoverHelpHost.hide(text)
            }
        }
    }
}

/// The AppKit view that carries the hovered view's tooltip.
@MainActor
enum NHoverHelpHost {
    private static weak var host: NSView?

    static func show(_ text: String) {
        let mouse = NSEvent.mouseLocation
        let number = NSWindow.windowNumber(at: mouse, belowWindowWithWindowNumber: 0)
        guard let window = NSApp.window(withWindowNumber: number), let content = window.contentView else {
            return
        }
        let point = content.convert(window.convertPoint(fromScreen: mouse), from: nil)
        let view = content.hitTest(point) ?? content
        if let host, host !== view {
            host.toolTip = nil
        }
        view.toolTip = text
        host = view
    }

    static func hide(_ text: String) {
        // The next view's tooltip may already be shown when this one's pointer leaves.
        if let host, host.toolTip == text {
            host.toolTip = nil
            self.host = nil
        }
    }
}
