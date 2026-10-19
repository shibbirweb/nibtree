import AppKit
import NibtreeTokens
import SwiftUI

/// How a highlighted text shows its matches: `strong` makes them bold in the accent color (quick open, recent
/// files), `mark` gives them a tinted background (search results), `search` a warning tint (Settings search).
public enum NHighlightTextVariant: String, CaseIterable, Sendable {
    case strong, mark, search
}

/// Text with its matched characters shown: the Swift side of ui/web `HighlightText` (docs/components/HighlightText.md).
/// `ranges` are [start, end) in UTF-16 units, like the web's string indices; they may overlap or come unsorted. The
/// words are the body text's, as wide as they are, wrapped when the room is narrower.
public struct NHighlightText: View {
    private let look: NHighlightLook

    public init(text: String, ranges: [Range<Int>], variant: NHighlightTextVariant = .strong) {
        look = NHighlightLook(text: text, ranges: ranges, variant: variant)
    }

    public var body: some View {
        let look = look
        NHighlightFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(look.text)
    }
}

/// The text's runs, laid out with Core Text: plain runs in the body font, matched ones marked (and semibold when
/// `strong`).
struct NHighlightLook: Sendable {
    /// Marks the matched runs in the attributed string.
    nonisolated static let matchKey = NSAttributedString.Key("NibtreeHighlightMatch")
    /// HighlightText.svelte's `color-mix(in srgb, var(--warning) 40%, transparent)` behind a Settings search match.
    nonisolated static let searchShare = 0.4

    let text: String
    let ranges: [Range<Int>]
    let variant: NHighlightTextVariant
    let line: NLineBox
    let state = NHighlightState()

    private struct Key: Hashable {
        let text: String
        let ranges: [Range<Int>]
        let strong: Bool
        let width: CGFloat?
    }

    /// Laid-out texts, shared like `NTextEngine`'s: a list shows the same names again and again.
    @MainActor private static var laidOut: [Key: [CTLine]] = [:]

    @MainActor
    init(text: String, ranges: [Range<Int>], variant: NHighlightTextVariant) {
        line = NTextMetrics.lineBox(NTypography.FontKey(GMTextStyles.body), lineHeight: nil)
        self.text = text
        self.ranges = ranges
        self.variant = variant
    }

    /// The runs, matched ones marked (and semibold when `strong`).
    @MainActor
    private func attributed() -> NSAttributedString {
        let font = NTypography.FontKey(GMTextStyles.body)
        let strong = NTypography.FontKey(GMTextStyles.body, weight: GMFontWeight.semibold)
        let built = NSMutableAttributedString()
        for part in NHighlightParts.parts(text, ranges: ranges) {
            let bold = part.match && variant == .strong
            let run = NSMutableAttributedString(
                attributedString: NTextEngine.attributed(
                    part.text, font: NTypography.nsFont(bold ? strong : font), kerning: 0, tabular: false))
            if part.match {
                run.addAttribute(Self.matchKey, value: true, range: NSRange(location: 0, length: run.length))
            }
            built.append(run)
        }
        return built
    }

    /// The lines in `width` points (nil for one line), kept for the last width asked.
    @MainActor
    func lines(width: CGFloat?) -> [CTLine] {
        let limit = width.map { ($0 * 64).rounded(.up) / 64 }
        if let kept = state.lines, kept.width == limit {
            return kept.lines
        }
        let key = Key(text: text, ranges: ranges, strong: variant == .strong, width: limit)
        let lines = Self.laidOut[key] ?? layOut(limit)
        if Self.laidOut.count >= 4000 {
            Self.laidOut.removeAll(keepingCapacity: true)
        }
        Self.laidOut[key] = lines
        state.lines = (limit, lines)
        return lines
    }

    @MainActor
    private func layOut(_ limit: CGFloat?) -> [CTLine] {
        let string = attributed()
        let full = CTLineCreateWithAttributedString(string)
        guard let limit, CGFloat(CTLineGetTypographicBounds(full, nil, nil, nil)) > limit + 0.01 else {
            return [full]
        }
        let typesetter = CTTypesetterCreateWithAttributedString(string)
        var lines: [CTLine] = []
        var start = 0
        while start < string.length {
            let count = max(1, CTTypesetterSuggestLineBreak(typesetter, start, Double(limit)))
            lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: start, length: count)))
            start += count
        }
        return lines
    }

    @MainActor
    func draw(palette: Palette, scale: CGFloat, in cg: CGContext) {
        guard let lines = state.lines?.lines else {
            return
        }
        let origin = state.origin
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        cg.setShouldSmoothFonts(false)
        cg.textMatrix = .identity
        let text = palette.cgColor(.text)
        let accent = palette.cgColor(.accent)
        let tint: CGColor? =
            switch variant {
            case .strong: nil
            case .mark: palette.cgColor(.diffInline)
            case .search:
                palette.cgColor(.warning).copy(alpha: palette.cgColor(.warning).alpha * Self.searchShare)
            }
        for (index, ctLine) in lines.enumerated() {
            let exact = CGFloat(index) * line.height + line.baseline
            let baseline = (exact * scale).rounded() / scale
            for run in CTLineGetGlyphRuns(ctLine) as? [CTRun] ?? [] {
                let attributes = CTRunGetAttributes(run) as NSDictionary
                let match = attributes[Self.matchKey] != nil
                if match, let tint {
                    markBackground(run, line: ctLine, baseline: baseline, color: tint, in: cg)
                }
                cg.saveGState()
                cg.setFillColor(match && variant == .strong ? accent : text)
                cg.translateBy(x: 0, y: baseline)
                cg.scaleBy(x: 1, y: -1)
                cg.textPosition = .zero
                CTRunDraw(run, cg, CFRange(location: 0, length: 0))
                cg.restoreGState()
            }
        }
    }

    /// A `<mark>`'s background: the run's width, the font's ascent above the baseline and descent below it.
    private func markBackground(
        _ run: CTRun, line ctLine: CTLine, baseline: CGFloat, color: CGColor, in cg: CGContext
    ) {
        let range = CTRunGetStringRange(run)
        let start = CTLineGetOffsetForStringIndex(ctLine, range.location, nil)
        let end = CTLineGetOffsetForStringIndex(ctLine, range.location + range.length, nil)
        var ascent: CGFloat = 0
        var descent: CGFloat = 0
        _ = CTRunGetTypographicBounds(run, CFRange(location: 0, length: 0), &ascent, &descent, nil)
        let box = CGRect(x: start, y: baseline - ascent, width: end - start, height: ascent + descent)
        let radius = variant == .mark ? GMRadius.tiny : 0
        cg.setFillColor(color)
        cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
        cg.fillPath()
    }
}

/// Where the text was placed, and its lines for the last width.
final class NHighlightState: @unchecked Sendable {
    var origin = CGPoint.zero
    var lines: (width: CGFloat?, lines: [CTLine])?
}

/// Sizes the text like a CSS block of it: its own width on one line, or the room on offer when it wraps.
private struct NHighlightFrame: Layout {
    let look: NHighlightLook

    private func size(_ lines: [CTLine]) -> CGSize {
        let width = lines.map { CGFloat(CTLineGetTypographicBounds($0, nil, nil, nil)) }.max() ?? 0
        return CGSize(width: width, height: CGFloat(lines.count) * look.line.height)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return MainActor.assumeIsolated { size(look.lines(width: width)) }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated { _ = look.lines(width: bounds.width) }
        look.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
