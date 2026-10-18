import NibtreeTokens
import SwiftUI

/// Everything a chip draws, worked out once from its props as Chip.svelte's classes do.
struct NChipLook: Sendable {
    /// A border or background color: a token, or a token mixed with transparent (`color-mix`).
    struct Paint: Sendable {
        let token: GMColorToken
        var alpha = 1.0

        func cgColor(_ palette: Palette) -> CGColor {
            let color = palette.cgColor(token)
            return alpha == 1 ? color : color.copy(alpha: color.alpha * alpha) ?? color
        }
    }

    let words: NTextSpec
    let icon: GMIconName?
    let status: NStatusIcon.State?
    let border: Paint
    let background: Paint?
    let text: GMColorToken
    /// Under the pointer: a pick's accent border and words, a pressable badge's hover background and plain words.
    let hoverBorder: Paint?
    let hoverBackground: Paint?
    let hoverText: GMColorToken?
    /// Nil when the chip is as tall as its words and padding (a pick).
    let height: CGFloat?
    let paddingY: CGFloat
    let paddingLeft: CGFloat
    let paddingRight: CGFloat
    let gap: CGFloat
    let radius: CGFloat

    /// Chip.svelte's `1px solid` border.
    nonisolated static let cssBorder = 1.0

    var hovers: Bool { hoverBorder != nil || hoverBackground != nil }

    var leadWidth: CGFloat? {
        status != nil ? GMStatusIconTokens.size : icon != nil ? NIconSize.small.points : nil
    }

    @MainActor
    init(
        text: String, variant: NChip.Variant, tone: NChip.Tone, icon: GMIconName?, status: NStatusIcon.State?,
        fontFamily: String?, pressable: Bool
    ) {
        let warning = tone == .warning
        var hoverBorder: Paint?
        var hoverBackground: Paint?
        var hoverText: GMColorToken?
        switch variant {
        case .filter:
            border = warning ? Paint(token: .warning, alpha: 0.45) : Paint(token: .border)
            background = warning ? Paint(token: .warning, alpha: 0.1) : nil
            self.text = warning ? .text : .textDim
            (height, paddingY, paddingLeft, paddingRight) = (GMChipTokens.height, 0, GMChipTokens.paddingLeft,
                GMChipTokens.paddingRight)
            (gap, radius) = (GMChipTokens.gap, GMChipTokens.radius)
        case .pick:
            border = Paint(token: .borderStrong)
            background = Paint(token: .panel)
            self.text = .text
            (hoverBorder, hoverText) = (Paint(token: .accent), .accent)
            (height, paddingY, paddingLeft, paddingRight) = (nil, GMChipTokens.pickPaddingY, GMChipTokens.pickPaddingX,
                GMChipTokens.pickPaddingX)
            (gap, radius) = (0, GMChipTokens.pickRadius)
        case .badge:
            border = warning ? Paint(token: .warning, alpha: 0.5) : Paint(token: .border)
            background = nil
            self.text = warning ? .warning : .textDim
            if pressable {
                (hoverBackground, hoverText) = (Paint(token: .hover), .text)
            }
            (height, paddingY, paddingLeft, paddingRight) = (GMChipTokens.badgeHeight, 0, GMChipTokens.badgePaddingX,
                GMChipTokens.badgePaddingX)
            (gap, radius) = (0, GMRadius.small)
        }
        (self.hoverBorder, self.hoverBackground, self.hoverText) = (hoverBorder, hoverBackground, hoverText)
        let size = variant == .pick ? GMFontSize.small : GMFontSize.xsmall
        let font = NTypography.FontKey(GMTextStyles.body, size: size, family: fontFamily)
        words = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: self.text, strike: false)
        self.icon = icon
        self.status = status
    }

    @MainActor
    var wordsWidth: CGFloat {
        if words.text.isEmpty {
            return 0
        }
        let layout = words.state.layout ?? words.layout(width: nil)
        words.state.layout = layout
        return layout.width
    }

    /// Where the words start, from the chip's left.
    @MainActor
    var wordsLeft: CGFloat {
        Self.cssBorder + paddingLeft + (leadWidth.map { $0 + (words.text.isEmpty ? 0 : gap) } ?? 0)
    }

    @MainActor
    var size: CGSize {
        let width = wordsLeft + wordsWidth + paddingRight + Self.cssBorder
        let content = max(words.line.height, leadWidth ?? 0)
        return CGSize(width: width, height: height ?? content + 2 * (paddingY + Self.cssBorder))
    }
}

/// The chip's room: its words and padding, or a column's whole width when one stretches it, like a flex item. Places
/// the status mark where the icon would be.
struct NChipFrame: Layout {
    let look: NChipLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.size }
        guard let offer = proposal.width, offer.isFinite else {
            return natural
        }
        return CGSize(width: max(offer, natural.width), height: natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.words.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        if subviews.count > 1 {
            let spot = CGPoint(x: bounds.minX + NChipLook.cssBorder + look.paddingLeft, y: bounds.midY)
            subviews[1].place(at: spot, anchor: .leading, proposal: .unspecified)
        }
    }
}
