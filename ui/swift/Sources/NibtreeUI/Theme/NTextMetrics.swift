import AppKit
import CoreText
import SwiftUI

/// A line of text the way WebKit lays it out, so `NText` lines up with ui/web's `Text` to the pixel.
public struct NLineBox: Equatable, Sendable {
    /// The line's height: the line height times the size, or for normal line height the rounded ascent, descent and
    /// line gap (WebKit's rule), in WebKit's 1/64 point steps.
    public let height: CGFloat
    /// The baseline from the line's top: half the leftover space above the font's ascent, like CSS.
    public let baseline: CGFloat
    /// Where SwiftUI puts the baseline in its own line (the rounded-up ascent) and that line's height.
    public let swiftUIBaseline: CGFloat
    public let swiftUIHeight: CGFloat
    /// How far above the baseline a line-through's top edge is: the 1 point line is centered half the x-height
    /// above the baseline, as in WebKit.
    public let strikeOffset: CGFloat

    /// Space to add above SwiftUI's line (it can be negative) so its baseline lands on WebKit's.
    public var top: CGFloat { baseline - swiftUIBaseline }
    /// Space to add below so the line is WebKit's height.
    public var bottom: CGFloat { height - swiftUIHeight - top }
    /// Extra space between wrapped lines.
    public var between: CGFloat { height - swiftUIHeight }
}

/// Line boxes and text widths, measured like WebKit and cached.
@MainActor
public enum NTextMetrics {
    private struct LineKey: Hashable {
        let font: NTypography.FontKey
        let lineHeight: Double?
    }

    private static var lines: [LineKey: NLineBox] = [:]
    private static let widths = NSCache<NSString, NSNumber>()

    private static func snap(_ value: CGFloat) -> CGFloat { (value * 64).rounded(.down) / 64 }

    /// The line box of `font` with a CSS line height (a multiple of the size), or the font's normal one for nil.
    public static func lineBox(_ font: NTypography.FontKey, lineHeight: Double?) -> NLineBox {
        let key = LineKey(font: font, lineHeight: lineHeight)
        if let line = lines[key] {
            return line
        }
        let appKit = NTypography.nsFont(font)
        let ascent = appKit.ascender
        let descent = -appKit.descender
        let gap = appKit.leading
        let height = lineHeight.map { snap($0 * font.size) } ?? ascent.rounded() + descent.rounded() + gap.rounded()
        // SwiftUI's own line height depends on the font (rounded up per side for the system font, the rounded total
        // for others), so it is measured once; its baseline sits the rounded-up descent above the line's bottom.
        let swiftUIHeight = measuredLineHeight(font)
        let line = NLineBox(
            height: height,
            baseline: snap((height - ascent - descent) / 2 + ascent),
            swiftUIBaseline: swiftUIHeight - descent.rounded(.up),
            swiftUIHeight: swiftUIHeight,
            strikeOffset: appKit.xHeight / 2 + 0.5)
        lines[key] = line
        return line
    }

    private static func measuredLineHeight(_ font: NTypography.FontKey) -> CGFloat {
        let probe = NSHostingView(rootView: Text("Hxg").font(NTypography.font(font)).fixedSize())
        return probe.fittingSize.height
    }

    /// The exact width of `text` on one line, letter spacing included after every character as in CSS.
    public static func width(of text: String, font: NTypography.FontKey, kerning: CGFloat) -> CGFloat {
        let cacheKey = "\(font.size)|\(font.weight)|\(font.mono)|\(kerning)|\(text)" as NSString
        if let cached = widths.object(forKey: cacheKey) {
            return CGFloat(cached.doubleValue)
        }
        let attributed = NSAttributedString(string: text, attributes: [.font: NTypography.nsFont(font)])
        let line = CTLineCreateWithAttributedString(attributed)
        let width = CTLineGetTypographicBounds(line, nil, nil, nil) + kerning * CGFloat(text.count)
        widths.setObject(NSNumber(value: Double(width)), forKey: cacheKey)
        return width
    }
}
