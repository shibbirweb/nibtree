import NibtreeTokens
import SwiftUI

/// Everything a row of tabs draws, worked out once from its props as Tabs.svelte's classes do.
struct NTabsLook: Sendable {
    /// The panel tabs' `letter-spacing: 0.06em`.
    nonisolated static let panelSpacing = 0.06

    let variant: NTabsVariant
    let tabs: [NTextSpec]
    let chosen: Int?
    /// Where each tab starts and how wide it is; set by the layout.
    let placed = NTabsPlaced()

    @MainActor
    init(labels: [String], chosen: Int?, variant: NTabsVariant) {
        self.variant = variant
        self.chosen = chosen
        tabs = labels.indices.map { index in
            let font: NTypography.FontKey
            let kerning: CGFloat
            let text: String
            switch variant {
            case .panel:
                font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.xsmall, weight: GMFontWeight.semibold)
                kerning = Self.panelSpacing * GMFontSize.xsmall
                text = labels[index].uppercased()
            case .underline:
                let weight = index == chosen ? GMFontWeight.semibold : GMFontWeight.regular
                font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.codeSmall, weight: weight)
                kerning = 0
                text = labels[index]
            }
            return NTextSpec(
                text: text, font: font, kerning: kerning, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .textDim, strike: false)
        }
    }

    var gap: CGFloat { variant == .panel ? GMPanelTabsTokens.gap : GMTabsTokens.underlineGap }
    /// The room left and right of an underline tab's words.
    var paddingX: CGFloat { variant == .panel ? 0 : GMTabsTokens.underlinePaddingX }

    /// The row's height: the panel token, or an underline tab's padding, words and indicator.
    var height: CGFloat {
        switch variant {
        case .panel: GMPanelTabsTokens.height
        case .underline:
            GMTabsTokens.underlinePaddingTop + (tabs.first?.line.height ?? 0) + GMTabsTokens.underlinePaddingBottom
                + GMTabsTokens.underlineIndicator
        }
    }

    /// Each tab's width: its words (letter spacing and all) and padding.
    @MainActor
    var widths: [CGFloat] {
        tabs.map { NTextMetrics.width(of: $0.text, font: $0.font, kerning: $0.kerning) + 2 * paddingX }
    }

    @MainActor
    func draw(hovered: Int?, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let shift = CGSize(width: origin.x - pixel(origin.x), height: origin.y - pixel(origin.y))
        for (index, spec) in tabs.enumerated() where placed.starts.indices.contains(index) {
            let x = placed.starts[index]
            let width = placed.widths[index]
            let lit = index == chosen || index == hovered
            if index == chosen {
                cg.setFillColor(palette.cgColor(.accent))
                switch variant {
                case .panel:
                    let bar = CGRect(
                        x: shift.width + x, y: shift.height + size.height - GMPanelTabsTokens.indicator, width: width,
                        height: GMPanelTabsTokens.indicator)
                    let radius = min(GMRadius.tiny, bar.height / 2)
                    cg.addPath(CGPath(roundedRect: bar, cornerWidth: radius, cornerHeight: radius, transform: nil))
                    cg.fillPath()
                case .underline:
                    cg.fill(
                        CGRect(
                            x: shift.width + x, y: shift.height + size.height - GMTabsTokens.underlineIndicator,
                            width: width, height: GMTabsTokens.underlineIndicator))
                }
            }
            let top = variant == .panel ? (size.height - spec.line.height) / 2 : GMTabsTokens.underlinePaddingTop
            let layout = spec.state.layout ?? spec.layout(width: nil)
            spec.state.layout = layout
            cg.saveGState()
            cg.translateBy(x: shift.width + x + paddingX, y: shift.height + top)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(lit ? .text : .textDim), strike: nil, scale: scale,
                in: cg, phase: shift.height + top)
            cg.restoreGState()
        }
    }
}

/// Where a row of tabs was placed, and each tab's start and width in it.
final class NTabsPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var starts: [CGFloat] = []
    var widths: [CGFloat] = []

    /// The tab under `x`, if any (the gaps between tabs belong to none).
    func index(at x: CGFloat) -> Int? {
        starts.indices.first { x >= starts[$0] && x < starts[$0] + widths[$0] }
    }
}

/// The row's size: its tabs side by side with the gap between them, at the variant's height; the canvas fills it.
struct NTabsFrame: Layout {
    let look: NTabsLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let widths = MainActor.assumeIsolated { look.widths }
        let width = widths.reduce(0, +) + CGFloat(max(0, widths.count - 1)) * look.gap
        return CGSize(width: width, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let widths = MainActor.assumeIsolated { look.widths }
        var x: CGFloat = 0
        look.placed.starts = widths.map { width in
            defer { x += width + look.gap }
            return x
        }
        look.placed.widths = widths
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
