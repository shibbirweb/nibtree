import NibtreeTokens
import SwiftUI

/// Everything a search field draws at rest, worked out once from its props as SearchField.svelte's classes do.
struct NSearchFieldLook: Sendable {
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0
    /// The clear button's `padding: var(--space-1)` around its icon, in the normal and large sizes.
    nonisolated static let clearPadding = GMSpace.s1
    /// The small size's `max-width: 50%`.
    nonisolated static let smallShare = 0.5

    let size: NSearchFieldSize
    let width: NControlWidth
    let placeholder: String
    let label: String
    let font: NTypography.FontKey
    let line: NLineBox

    @MainActor
    init(placeholder: String, label: String, size: NSearchFieldSize, width: NControlWidth) {
        font = NTypography.FontKey(GMTextStyles.body, size: size == .small ? GMFontSize.small : nil)
        line = NTextMetrics.lineBox(font, lineHeight: nil)
        self.size = size
        self.width = width
        self.placeholder = placeholder
        self.label = label
    }

    var height: CGFloat {
        switch size {
        case .normal: GMSearchFieldTokens.height
        case .large: GMSearchFieldTokens.largeHeight
        case .compact: GMSearchFieldTokens.compactHeight
        case .small: GMSearchFieldTokens.smallHeight
        }
    }

    var gap: CGFloat {
        switch size {
        case .normal, .small: GMSearchFieldTokens.gap
        case .large: GMSearchFieldTokens.largeGap
        case .compact: GMSearchFieldTokens.compactGap
        }
    }

    var paddingLeft: CGFloat { size == .large ? GMSearchFieldTokens.largePaddingX : GMSearchFieldTokens.paddingLeft }

    var paddingRight: CGFloat {
        switch size {
        case .normal: GMSearchFieldTokens.paddingRight
        case .large: GMSearchFieldTokens.largePaddingX
        case .compact: GMSearchFieldTokens.compactPaddingRight
        case .small: GMSearchFieldTokens.smallPaddingRight
        }
    }

    var magnifierTone: GMColorToken { size == .normal ? .textFaint : .textDim }

    /// The clear button's side: its icon and padding, or the token square in the compact and small sizes.
    var clearSide: CGFloat {
        switch size {
        case .normal, .large: NIconSize.compact.points + 2 * Self.clearPadding
        case .compact, .small: GMSearchFieldTokens.clearSize
        }
    }

    /// Where the text starts: the border, the padding, the magnifier and the gap.
    var textLeft: CGFloat { Self.border + paddingLeft + NIconSize.medium.points + gap }

    /// The width with nothing on offer (or only `offer` on offer): the preset's, the small size's own, or WebKit's 20
    /// characters with the magnifier, padding and border (and the clear button when there is text).
    @MainActor
    func width(offer: CGFloat?, clearing: Bool) -> CGFloat {
        let share = offer.map { $0 * Self.smallShare } ?? .infinity
        if let points = width.points {
            return size == .small ? min(points, share) : points
        }
        if width == .fill, let offer {
            return size == .small ? min(offer, share) : offer
        }
        if size == .small {
            return min(GMSearchFieldTokens.smallWidth, share)
        }
        if let offer {
            return offer
        }
        let input = NInputLook.fieldWidth(font)
        return textLeft + input + (clearing ? gap + clearSide : 0) + paddingRight + Self.border
    }

    @MainActor
    func draw(
        value: String, focused: Bool, origin: CGPoint, size box: CGSize, palette: Palette, scale: CGFloat,
        in cg: CGContext
    ) {
        let radius = GMSearchFieldTokens.radius
        let frame = CGRect(origin: .zero, size: box)
        if focused {
            let ring = palette.cgColor(.accent)
            let spread = GMInputTokens.focusRing
            cg.addPath(
                CGPath(
                    roundedRect: frame.insetBy(dx: -spread, dy: -spread), cornerWidth: radius + spread,
                    cornerHeight: radius + spread, transform: nil))
            cg.setFillColor(ring.copy(alpha: ring.alpha * NInputLook.ringShare) ?? ring)
            cg.fillPath()
        }
        let outer = CGPath(roundedRect: frame, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(size == .large ? .editorBg : .panel))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: frame.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                cornerHeight: radius - Self.border, transform: nil))
        cg.setFillColor(palette.cgColor(focused ? .accent : .borderStrong))
        cg.fillPath(using: .evenOdd)
        // WebKit puts an SVG on whole device pixels: the icon's spot on the page, rounded, less the canvas's own.
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let points = NIconSize.medium.points
        let color = palette.cgColor(magnifierTone)
        let key = NIconImages.Key(
            name: .search, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            let x = pixel(origin.x + Self.border + paddingLeft) - pixel(origin.x)
            let y = pixel(origin.y + (box.height - points) / 2) - pixel(origin.y)
            cg.saveGState()
            cg.translateBy(x: x, y: y + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        let shown = value.isEmpty ? placeholder : value
        guard !shown.isEmpty else {
            return
        }
        let right = value.isEmpty ? 0 : gap + clearSide
        let room = box.width - textLeft - right - paddingRight - Self.border
        let layout = NTextEngine.layout(shown, font: font, kerning: 0, tabular: false, truncate: false, width: nil)
        // The input clips what does not fit, as a text field scrolls its text.
        cg.clip(to: CGRect(x: textLeft, y: 0, width: max(0, room), height: box.height))
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + textLeft,
            y: origin.y - (origin.y * scale).rounded() / scale + (box.height - line.height) / 2)
        let tone = value.isEmpty ? NWebKitColors.placeholder : palette.cgColor(.text)
        NTextEngine.draw(layout, line: line, color: tone, strike: nil, scale: scale, in: cg)
    }
}

/// The search field's size: the token height and the width `NSearchFieldLook` picks; the face under all of it, a text
/// field while editing in the text's place, and the clear button at the end.
struct NSearchFieldFrame: Layout {
    let look: NSearchFieldLook
    let clearing: Bool
    let origin: NTextState

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = MainActor.assumeIsolated { look.width(offer: offer, clearing: clearing) }
        return CGSize(width: width, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        origin.origin = bounds.origin
        let clearSide = look.clearSide
        let right = bounds.maxX - NSearchFieldLook.border - look.paddingRight
        for subview in subviews {
            switch subview[NSearchFieldPart.self] {
            case .face:
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            case .clear:
                subview.place(
                    at: CGPoint(x: right - clearSide, y: bounds.midY - clearSide / 2), anchor: .topLeading,
                    proposal: ProposedViewSize(width: clearSide, height: clearSide))
            case .text:
                let left = bounds.minX + look.textLeft
                let end = clearing ? right - clearSide - look.gap : right
                subview.place(
                    at: CGPoint(x: left, y: bounds.midY), anchor: .leading,
                    proposal: ProposedViewSize(width: max(0, end - left), height: nil))
            }
        }
    }
}

/// Which part of a search field a subview is.
enum NSearchFieldPart: LayoutValueKey {
    case face, text, clear
    static let defaultValue = NSearchFieldPart.text
}
