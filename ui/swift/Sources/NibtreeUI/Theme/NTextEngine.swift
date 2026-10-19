import AppKit
import CoreText
import SwiftUI

/// Text laid out and drawn with Core Text, the engine WebKit uses: the same font object, glyph positions and line
/// breaks as ui/web, and much cheaper than a SwiftUI `Text` per label (a list of a thousand labels draws in about a
/// third of the time). Lines are cached by text, font, letter spacing and width.
@MainActor
public enum NTextEngine {
    /// One text laid out for a width. Core Text lines never change once made, so it is safe to share.
    public struct Layout: @unchecked Sendable {
        public let lines: [CTLine]
        /// The widest line's width (exact, with fractions).
        public let width: CGFloat
    }

    private struct Key: Hashable {
        let text: String
        let font: NTypography.FontKey
        let kerning: CGFloat
        let tabular: Bool
        let truncate: Bool
        let width: CGFloat?
    }

    /// Laid-out texts; emptied when it grows past `limit`, so memory stays bounded in a long session.
    private static var layouts: [Key: Layout] = [:]
    private static let limit = 4000

    private static let tabularFeature: [[NSFontDescriptor.FeatureKey: Int]] = [
        [.typeIdentifier: kNumberSpacingType, .selectorIdentifier: kMonospacedNumbersSelector],
    ]

    /// The text's string with its font and letter spacing; the color comes from the context when drawing.
    static func attributed(_ text: String, font: NSFont, kerning: CGFloat, tabular: Bool) -> NSAttributedString {
        var shown = font
        if tabular {
            let descriptor = font.fontDescriptor.addingAttributes([.featureSettings: tabularFeature])
            shown = NSFont(descriptor: descriptor, size: font.pointSize) ?? font
        }
        var attributes: [NSAttributedString.Key: Any] = [
            .font: shown,
            NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
        ]
        if kerning != 0 {
            attributes[.kern] = kerning
        }
        return NSAttributedString(string: text, attributes: attributes)
    }

    /// The lines of `text` in `width` points (nil for one unbroken line): wrapped like CSS, or cut with an ellipsis
    /// when `truncate` is set.
    public static func layout(
        _ text: String, font: NTypography.FontKey, kerning: CGFloat, tabular: Bool, truncate: Bool, width: CGFloat?
    ) -> Layout {
        // Rounded up to WebKit's 1/64 steps: a text offered exactly its own width must fit, not wrap.
        let limit = width.map { ($0 * 64).rounded(.up) / 64 }
        let key = Key(text: text, font: font, kerning: kerning, tabular: tabular, truncate: truncate, width: limit)
        if let cached = layouts[key] {
            return cached
        }
        let string = attributed(text, font: NTypography.nsFont(font), kerning: kerning, tabular: tabular)
        let full = CTLineCreateWithAttributedString(string)
        let fullWidth = CGFloat(CTLineGetTypographicBounds(full, nil, nil, nil))
        var lines: [CTLine] = [full]
        if let limit, fullWidth > limit + 0.01 {
            if truncate {
                lines = [truncated(string, full: full, limit: limit)]
            } else {
                lines = wrapped(string, width: limit)
            }
        }
        let widest = lines.map { CGFloat(CTLineGetTypographicBounds($0, nil, nil, nil)) }.max() ?? 0
        let layout = Layout(lines: lines, width: widest)
        if layouts.count >= Self.limit {
            layouts.removeAll(keepingCapacity: true)
        }
        layouts[key] = layout
        return layout
    }

    /// The line cut to `limit` with an ellipsis. Like WebKit (and CSS), the first character always stays, with the
    /// ellipsis after it even when that overflows: the box around the text clips what does not fit.
    private static func truncated(_ string: NSAttributedString, full: CTLine, limit: CGFloat) -> CTLine {
        let attributes = string.attributes(at: 0, effectiveRange: nil)
        let dots = CTLineCreateWithAttributedString(NSAttributedString(string: "\u{2026}", attributes: attributes))
        let first = (string.string as NSString).rangeOfComposedCharacterSequence(at: 0)
        let head = NSMutableAttributedString(attributedString: string.attributedSubstring(from: first))
        head.append(NSAttributedString(string: "\u{2026}", attributes: attributes))
        let shortest = CTLineCreateWithAttributedString(head)
        if CGFloat(CTLineGetTypographicBounds(shortest, nil, nil, nil)) > limit {
            return shortest
        }
        return CTLineCreateTruncatedLine(full, Double(limit), .end, dots) ?? full
    }

    private static func wrapped(_ string: NSAttributedString, width: CGFloat) -> [CTLine] {
        let typesetter = CTTypesetterCreateWithAttributedString(string)
        var lines: [CTLine] = []
        var start = 0
        while start < string.length {
            let count = max(1, CTTypesetterSuggestLineBreak(typesetter, start, Double(width)))
            lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: start, length: count)))
            start += count
        }
        return lines
    }

    /// Draws `layout` in a context whose origin is the text's top left, one line per `line.height`, each on its
    /// WebKit baseline, without font smoothing (like `-webkit-font-smoothing: antialiased`).
    /// `strike` is the line-through's color (ui/web draws it in the faint text color), or nil for none. With
    /// `centeredIn`, each line is centered in that width like CSS `text-align: center` (a wrapped line's trailing
    /// space hangs outside). `phase` is how far below a whole device pixel the drawing's origin sits, so baselines
    /// snap to the window's pixels, not the origin's.
    static func draw(
        _ layout: Layout, line: NLineBox, color: CGColor, strike: CGColor?, scale: CGFloat, in context: CGContext,
        centeredIn: CGFloat? = nil, phase: CGFloat = 0
    ) {
        context.setShouldSmoothFonts(false)
        context.setFillColor(color)
        context.textMatrix = .identity
        for (index, ctLine) in layout.lines.enumerated() {
            // Baselines sit on whole device pixels, as in WebKit.
            let exact = CGFloat(index) * line.height + line.baseline
            let baseline = ((exact + phase) * max(1, scale)).rounded() / max(1, scale) - phase
            var left: CGFloat = 0
            if let centeredIn {
                let width = CTLineGetTypographicBounds(ctLine, nil, nil, nil) - CTLineGetTrailingWhitespaceWidth(ctLine)
                left = (centeredIn - CGFloat(width)) / 2
            }
            context.saveGState()
            context.translateBy(x: left, y: baseline)
            context.scaleBy(x: 1, y: -1)
            context.textPosition = .zero
            CTLineDraw(ctLine, context)
            context.restoreGState()
            if let strike {
                let width = CGFloat(CTLineGetTypographicBounds(ctLine, nil, nil, nil))
                context.setFillColor(strike)
                let top = ((baseline - line.strikeOffset) * max(1, scale)).rounded() / max(1, scale)
                context.fill(CGRect(x: left, y: top, width: width, height: 1))
                context.setFillColor(color)
            }
        }
    }
}
