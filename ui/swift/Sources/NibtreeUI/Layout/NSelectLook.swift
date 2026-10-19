import NibtreeTokens
import SwiftUI

/// Everything a select draws at rest, worked out once from its props as Select.svelte's classes do.
struct NSelectLook: Sendable {
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0
    /// Select.svelte's `opacity: 0.5` while disabled.
    nonisolated static let disabledOpacity = 0.5

    let size: NSelectSize
    let width: NControlWidth
    let spec: NTextSpec
    /// The widest choice's words, which set WebKit's own width for the drop-down.
    let widest: CGFloat

    @MainActor
    init(labels: [String], chosen: String, size: NSelectSize, width: NControlWidth) {
        let font = NTypography.FontKey(GMTextStyles.body, size: size == .small ? GMFontSize.small : nil)
        spec = NTextSpec(
            text: chosen, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        widest = labels.map { NTextMetrics.width(of: $0, font: font, kerning: 0) }.max() ?? 0
        self.size = size
        self.width = width
    }

    var height: CGFloat { size == .small ? GMSize.controlSmall : GMInputTokens.height }
    var paddingLeft: CGFloat { size == .small ? GMSpace.s2 : GMInputTokens.paddingX }
    /// The room on the right the chevron sits in.
    var arrowSpace: CGFloat { size == .small ? GMSelectTokens.smallArrowSpace : GMSelectTokens.arrowSpace }
    var arrowInset: CGFloat { size == .small ? GMSelectTokens.smallArrowInset : GMSelectTokens.arrowInset }

    /// The width: the preset's, the parent's for `fill`, or WebKit's own (the widest choice rounded up to a point,
    /// with the padding and border); never past the large control width.
    func width(offer: CGFloat?) -> CGFloat {
        let own: CGFloat
        if let points = width.points {
            own = points
        } else if width == .fill, let offer {
            own = offer
        } else {
            own = widest.rounded(.up) + paddingLeft + arrowSpace + 2 * Self.border
        }
        return min(own, GMControlWidth.large)
    }

    @MainActor
    func draw(origin: CGPoint, size box: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let radius = GMInputTokens.radius
        let frame = CGRect(origin: .zero, size: box)
        let outer = CGPath(roundedRect: frame, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(.panel))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: frame.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                cornerHeight: radius - Self.border, transform: nil))
        cg.setFillColor(palette.cgColor(.borderStrong))
        cg.fillPath(using: .evenOdd)
        // WebKit puts an SVG on whole device pixels: the icon's spot on the page, rounded, less the canvas's own.
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let points = NIconSize.compact.points
        let color = palette.cgColor(.textDim)
        let key = NIconImages.Key(
            name: .chevronDown, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            let x = pixel(origin.x + box.width - arrowInset - points) - pixel(origin.x)
            let y = pixel(origin.y + (box.height - points) / 2) - pixel(origin.y)
            cg.saveGState()
            cg.translateBy(x: x, y: y + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        guard !spec.text.isEmpty else {
            return
        }
        let left = Self.border + paddingLeft
        let room = box.width - left - arrowSpace - Self.border
        let layout = spec.state.layout ?? spec.layout(width: nil)
        spec.state.layout = layout
        // The drop-down clips the chosen words at its padding, with no ellipsis.
        cg.clip(to: CGRect(x: left, y: 0, width: max(0, room), height: box.height))
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + left,
            y: origin.y - (origin.y * scale).rounded() / scale + (box.height - spec.line.height) / 2)
        NTextEngine.draw(layout, line: spec.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
    }
}

/// The select's size: the token height and the width `NSelectLook` picks, the face filling it.
struct NSelectFrame: Layout {
    let look: NSelectLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return CGSize(width: look.width(offer: offer), height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
