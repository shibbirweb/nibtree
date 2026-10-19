import NibtreeTokens
import SwiftUI

/// Everything a section title draws, worked out once from its props as SectionTitle.svelte's classes do.
struct NSectionTitleLook: Sendable {
    let variant: NSectionTitleVariant
    let title: String
    let matches: [Range<Int>]
    let count: Int?
    let font: NTypography.FontKey
    let countFont: NTypography.FontKey
    let kerning: CGFloat
    let line: NLineBox
    let tone: GMColorToken
    let placed = NSectionTitlePlaced()

    @MainActor
    init(title: String, matches: [Range<Int>], variant: NSectionTitleVariant, count: Int?) {
        let (size, weight, spacing, upper): (CGFloat, Font.Weight, Double, Bool) =
            switch variant {
            case .bar, .list: (GMFontSize.small, GMFontWeight.semibold, 0, false)
            case .caption: (GMFontSize.compact, GMFontWeight.regular, 0, false)
            case .caps: (GMFontSize.xsmall, GMFontWeight.semibold, GMLetterSpacing.label, true)
            case .day: (GMFontSize.xsmall, GMFontWeight.semibold, 0, false)
            case .group: (GMFontSize.xsmall, GMFontWeight.semibold, GMLetterSpacing.caps, true)
            case .band: (GMFontSize.compact, GMFontWeight.semibold, 0, false)
            case .picker: (GMFontSize.compact, GMFontWeight.semibold, 0, true)
            case .divided: (GMTextStyles.body.size, GMFontWeight.regular, 0, false)
            }
        font = NTypography.FontKey(GMTextStyles.body, size: size, weight: weight)
        countFont = NTypography.FontKey(GMTextStyles.body, size: size, weight: GMFontWeight.regular)
        kerning = spacing * size
        line = NTextMetrics.lineBox(font, lineHeight: nil)
        tone = variant == .picker ? .textFaint : variant == .divided ? .text : .textDim
        // Uppercase keeps the length of these titles, so the match ranges still fit.
        self.title = upper ? title.uppercased() : title
        self.matches = matches
        self.variant = variant
        self.count = count
    }

    /// A bar and a divided title space their count like their buttons; the others run it on after a space.
    var inlineCount: Bool { variant != .bar && variant != .divided }

    var gap: CGFloat {
        switch variant {
        case .bar: GMSectionTitleTokens.gap
        case .divided: GMSectionTitleTokens.dividedGap
        default: 0
        }
    }

    /// Top, left, bottom and right padding; the bottom line's point is in `bottom`.
    var padding: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat) {
        typealias T = GMSectionTitleTokens
        return switch variant {
        case .bar: (0, T.barPaddingLeft, 1, T.barPaddingRight)
        case .list: (T.listPaddingTop, T.listPaddingX, T.listPaddingBottom, T.listPaddingX)
        case .caption: (T.captionPaddingTop, T.captionPaddingX, T.captionPaddingBottom, T.captionPaddingX)
        case .caps: (T.capsPaddingTop, T.capsPaddingX, T.capsPaddingBottom, T.capsPaddingX)
        case .day: (T.dayPaddingTop, T.dayPaddingX, T.dayPaddingBottom, T.dayPaddingX)
        case .group: (0, 0, T.groupBottom, 0)
        case .band: (T.bandPaddingTop, T.bandPaddingX, T.bandPaddingBottom + 1, T.bandPaddingX)
        case .picker: (T.pickerPaddingTop, T.pickerPaddingX, T.pickerPaddingBottom, T.pickerPaddingX)
        case .divided: (T.dividedPaddingY, 0, T.dividedPaddingY + 1, 0)
        }
    }

    /// The title's line: the words (a search's matches marked) and, run on, the count in the regular weight.
    @MainActor
    func titleString() -> NSAttributedString {
        let built = NSMutableAttributedString()
        let titleFont = NTypography.nsFont(font)
        for part in NHighlightParts.parts(title, ranges: matches) {
            let run = NSMutableAttributedString(
                attributedString: NTextEngine.attributed(part.text, font: titleFont, kerning: kerning, tabular: false))
            if part.match {
                run.addAttribute(NHighlightLook.matchKey, value: true, range: NSRange(location: 0, length: run.length))
            }
            built.append(run)
        }
        if inlineCount, let count {
            built.append(NTextEngine.attributed(" ", font: titleFont, kerning: kerning, tabular: false))
            let number = NTypography.nsFont(countFont)
            built.append(NTextEngine.attributed(String(count), font: number, kerning: kerning, tabular: false))
        }
        return built
    }

    /// The count spaced on its own (a bar's, a divided title's).
    @MainActor
    var spacedCount: NTextSpec? {
        guard !inlineCount, let count else {
            return nil
        }
        return NTextSpec(
            text: String(count), font: countFont, kerning: kerning, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(countFont, lineHeight: nil), tone: tone, strike: false)
    }
}

/// Where the title and count went, set by the layout.
final class NSectionTitlePlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var title: CTLine?
    var countLeft: CGFloat = 0
    var count: NTextEngine.Layout?
    var countLine: NLineBox?
}

/// The title's flex row: the padding around the title (cut to its room), the spaced count, and the actions at the
/// end, each centered between the padding; the face under all of it. A bar is the token height, the others as tall
/// as their line and padding.
struct NSectionTitleLayout: Layout {
    let look: NSectionTitleLook

    private struct Parts {
        var title: CTLine
        var count: NTextEngine.Layout?
        var countLine: NLineBox?
        var actions: [CGSize]
    }

    /// Laid-out titles, shared: a list repeats the same headings.
    @MainActor private static var titles: [String: CTLine] = [:]

    @MainActor
    private func parts(_ subviews: Subviews) -> Parts {
        let key = "\(look.variant)|\(look.title)|\(look.count ?? -1)|\(look.matches)"
        let title = Self.titles[key] ?? CTLineCreateWithAttributedString(look.titleString())
        if Self.titles.count > 2000 {
            Self.titles.removeAll(keepingCapacity: true)
        }
        Self.titles[key] = title
        let count = look.spacedCount
        return Parts(
            title: title, count: count.map { $0.layout(width: nil) }, countLine: count?.line,
            actions: subviews.dropFirst().map { $0.sizeThatFits(.unspecified) })
    }

    /// Everything but the title: padding, the count, the actions and the gaps between them.
    private func fixed(_ parts: Parts) -> CGFloat {
        let padding = look.padding
        let actions = parts.actions.reduce(0) { $0 + $1.width } + CGFloat(max(0, parts.actions.count - 1))
        let count = parts.count.map { $0.width + look.gap } ?? 0
        return padding.left + padding.right + count + (parts.actions.isEmpty ? 0 : actions + look.gap)
    }

    private func height(_ parts: Parts) -> CGFloat {
        if look.variant == .bar {
            return GMSectionTitleTokens.barHeight
        }
        let padding = look.padding
        let tallest = max(look.line.height, parts.actions.map(\.height).max() ?? 0)
        return padding.top + tallest + padding.bottom
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        MainActor.assumeIsolated {
            let parts = parts(subviews)
            let natural = fixed(parts) + CGFloat(CTLineGetTypographicBounds(parts.title, nil, nil, nil))
            return CGSize(width: proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural, height: height(parts))
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let parts = parts(subviews)
            let room = max(0, bounds.width - fixed(parts))
            let natural = CGFloat(CTLineGetTypographicBounds(parts.title, nil, nil, nil))
            var title = parts.title
            if natural > room + 0.01 {
                let dots = CTLineCreateWithAttributedString(
                    NTextEngine.attributed(
                        "\u{2026}", font: NTypography.nsFont(look.font), kerning: look.kerning, tabular: false))
                title = CTLineCreateTruncatedLine(parts.title, Double(room), .end, dots) ?? parts.title
            }
            let shown = min(natural, room)
            look.placed.title = title
            look.placed.count = parts.count
            look.placed.countLine = parts.countLine
            look.placed.countLeft = shown + look.gap
            look.placed.origin = bounds.origin
            subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            let padding = look.padding
            let middle = bounds.minY + padding.top + (bounds.height - padding.top - padding.bottom) / 2
            var x = bounds.maxX - padding.right
            for (action, size) in zip(subviews.dropFirst(), parts.actions).reversed() {
                action.place(at: CGPoint(x: x, y: middle), anchor: .trailing, proposal: ProposedViewSize(size))
                x -= size.width + 1
            }
        }
    }
}
