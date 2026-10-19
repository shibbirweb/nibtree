import AppKit
import SwiftUI

/// The system colors WebKit paints its own controls with (a checkbox, a range input), per appearance, not the theme's:
/// kept, and dropped when the user changes the accent color.
@MainActor
struct NWebKitColors {
    /// The accent, for a control without `accent-color`.
    let accent: Color
    /// A checkbox's ring.
    let ring: Color
    /// Inside an empty checkbox, and the border around a slider's track.
    let inside: Color
    /// A slider's track: WebKit's `-apple-system-opaque-fill`, which AppKit does not name.
    let track: Color

    private static var kept: [Bool: NWebKitColors] = [:]
    private static let watch: NSObjectProtocol = NotificationCenter.default.addObserver(
        forName: NSColor.systemColorsDidChangeNotification, object: nil, queue: .main
    ) { _ in
        MainActor.assumeIsolated { kept = [:] }
    }

    static func colors(dark: Bool) -> NWebKitColors {
        _ = watch
        if let colors = kept[dark] {
            return colors
        }
        var colors = NWebKitColors(accent: .clear, ring: .clear, inside: .clear, track: .clear)
        NSAppearance(named: dark ? .darkAqua : .aqua)?.performAsCurrentDrawingAppearance {
            colors = NWebKitColors(
                accent: Color(cgColor: NSColor.controlAccentColor.cgColor),
                ring: Color(cgColor: NSColor.secondaryLabelColor.cgColor),
                inside: Color(cgColor: NSColor.controlBackgroundColor.cgColor),
                track: Color(white: dark ? opaqueFillDark : opaqueFillLight))
        }
        kept[dark] = colors
        return colors
    }

    private static let opaqueFillLight = 230.0 / 255
    private static let opaqueFillDark = 52.0 / 255
}

extension NWebKitColors {
    /// A text area's resize grip: AppKit's secondary label color, as WebKit paints it.
    static func grip(dark: Bool) -> CGColor {
        var color = CGColor(gray: 0.5, alpha: 1)
        NSAppearance(named: dark ? .darkAqua : .aqua)?.performAsCurrentDrawingAppearance {
            color = NSColor.secondaryLabelColor.cgColor
        }
        return color
    }

    /// Selected text's background: AppKit's selected text color, which WebKit fades to 80% in the dark appearance.
    static func selection(dark: Bool) -> CGColor {
        var color = CGColor(gray: 0.7, alpha: 1)
        NSAppearance(named: dark ? .darkAqua : .aqua)?.performAsCurrentDrawingAppearance {
            color = NSColor.selectedTextBackgroundColor.cgColor
        }
        return dark ? color.copy(alpha: color.alpha * darkSelectionShare) ?? color : color
    }

    private static let darkSelectionShare = 0.8

    /// Selected text's own color: AppKit's in the dark appearance; in the light one WebKit keeps the text's color
    /// (nil).
    static func selectedText(dark: Bool) -> CGColor? {
        guard dark else {
            return nil
        }
        var color = CGColor(gray: 1, alpha: 1)
        NSAppearance(named: .darkAqua)?.performAsCurrentDrawingAppearance {
            color = NSColor.selectedTextColor.cgColor
        }
        return color
    }

    /// A text field's placeholder: WebKit's `::placeholder { color: darkGray }`, in both appearances.
    nonisolated static let placeholder = CGColor(srgbRed: 169 / 255, green: 169 / 255, blue: 169 / 255, alpha: 1)
}
