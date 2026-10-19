import NibtreeTokens
import SwiftUI

/// Everything a ref label draws, worked out once from its props as RefLabel.svelte's classes do.
struct NRefLabelLook: Sendable {
    /// RefLabel.svelte's `1px solid` border.
    nonisolated static let cssBorder = 1.0
    /// The app's violet for remote branches: RefLabel.svelte mixes it from the accent and this fixed color.
    nonisolated static let violet = CGColor(srgbRed: 0xb0 / 255, green: 0x4a / 255, blue: 0xd8 / 255, alpha: 1)
    /// RefLabel.svelte's `color-mix` shares: the border, the background over the row, the words over the text.
    nonisolated static let borderShare = 0.45
    nonisolated static let backgroundShare = 0.14
    nonisolated static let textShare = 0.8
    nonisolated static let remoteAccentShare = 0.45

    let kind: NRefLabel.Kind
    let words: NTextSpec
    let icon: GMIconName?
    /// The name on one line, kept once laid out: the shown layout is cut from it when the label is too narrow.
    let natural = NRefLabelNatural()

    @MainActor
    init(kind: NRefLabel.Kind, label: String, icon: GMIconName?) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: GMFontSize.xsmall,
            weight: kind == .head ? GMFontWeight.bold : GMFontWeight.regular)
        let line = NTextMetrics.lineBox(font, lineHeight: Double(GMRefLabelTokens.lineHeight / font.size))
        words = NTextSpec(
            text: label, font: font, kerning: 0, tabular: false, truncate: true, line: line, tone: .text,
            strike: false)
        self.kind = kind
        self.icon = icon
    }

    /// Where the name starts, from the label's left.
    var wordsLeft: CGFloat {
        Self.cssBorder + GMRefLabelTokens.paddingX + (icon == nil ? 0 : NIconSize.xsmall.points + GMRefLabelTokens.gap)
    }

    /// The room the name has in a label `width` wide.
    func room(_ width: CGFloat) -> CGFloat {
        max(0, width - wordsLeft - GMRefLabelTokens.paddingX - Self.cssBorder)
    }

    @MainActor
    var naturalLayout: NTextEngine.Layout {
        if let layout = natural.layout {
            return layout
        }
        let layout = words.layout(width: nil)
        natural.layout = layout
        return layout
    }

    @MainActor
    var naturalWidth: CGFloat {
        wordsLeft + naturalLayout.width + GMRefLabelTokens.paddingX + Self.cssBorder
    }

    /// The ref's own color (RefLabel.svelte's `--ref-color`).
    private func refColor(_ palette: Palette) -> CGColor {
        switch kind {
        case .head: palette.cgColor(.accent)
        case .local, .bisectGood: palette.cgColor(.success)
        case .remote: NAvatarFace.mix(palette.cgColor(.accent), Self.violet, share: Self.remoteAccentShare)
        case .tag, .bisectCurrent: palette.cgColor(.warning)
        case .bisectBad: palette.cgColor(.danger)
        case .more, .bisectSkip: palette.cgColor(.textDim)
        }
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, row: GMColorToken, scale: CGFloat, in cg: CGContext) {
        let ref = refColor(palette)
        let head = kind == .head
        let box = CGRect(origin: .zero, size: size)
        let radius = min(GMRefLabelTokens.radius, size.height / 2)
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(head ? ref : NAvatarFace.mix(ref, palette.cgColor(row), share: Self.backgroundShare))
        cg.fillPath()
        if !head {
            let width = Self.cssBorder
            let inner = max(0, radius - width)
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: width, dy: width), cornerWidth: inner, cornerHeight: inner,
                    transform: nil))
            cg.setFillColor(ref.copy(alpha: ref.alpha * Self.borderShare) ?? ref)
            cg.fillPath(using: .evenOdd)
        }
        let color =
            head ? palette.cgColor(.accentText) : NAvatarFace.mix(ref, palette.cgColor(.text), share: Self.textShare)
        let origin = words.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        // The name's line box is the token's line height (the font's line comes from 15 / 11 and lands a hair short),
        // centered in the border: off whole pixels, Core Graphics drew the words a device pixel low.
        let top = (size.height - GMRefLabelTokens.lineHeight) / 2
        if let icon {
            let points = NIconSize.xsmall.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: icon == .more ? GMIconStroke.heavy : NIconStroke.normal.width,
                scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                // WebKit puts an SVG on whole device pixels.
                let x = ((Self.cssBorder + GMRefLabelTokens.paddingX + phase.x) * scale).rounded() / scale
                let y = (((size.height - points) / 2 + phase.y) * scale).rounded() / scale
                cg.saveGState()
                cg.translateBy(x: x, y: y + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        guard let layout = words.state.layout, !words.text.isEmpty else {
            return
        }
        cg.translateBy(x: wordsLeft + phase.x, y: top + phase.y)
        NTextEngine.draw(layout, line: words.line, color: color, strike: nil, scale: scale, in: cg)
    }
}

/// A ref label's name laid out on one line, once.
final class NRefLabelNatural: @unchecked Sendable {
    var layout: NTextEngine.Layout?
}

/// The label's room: its name and padding, or a column's whole width when one stretches it, like a flex item; at most
/// the token's max width either way. Cuts the name to what fits.
struct NRefLabelFrame: Layout {
    let look: NRefLabelLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.naturalWidth }
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural
        return CGSize(width: min(width, GMRefLabelTokens.maxWidth), height: GMRefLabelTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let natural = look.naturalLayout
            let room = look.room(bounds.width)
            look.words.state.layout = natural.width <= room ? natural : look.words.layout(width: room)
        }
        look.words.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
