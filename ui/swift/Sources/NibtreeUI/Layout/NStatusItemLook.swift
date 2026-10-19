import NibtreeTokens
import SwiftUI

/// Which views of a status item are the caller's leading and trailing ones, and which is the turning icon.
enum NStatusItemPart: LayoutValueKey {
    static let defaultValue = Part.face

    enum Part {
        case face, leading, spin, trailing
    }
}

/// Everything a status item draws, worked out once from its props as StatusItem.svelte's classes do.
struct NStatusItemLook: Sendable {
    /// StatusItem.svelte's `opacity: 0.6` on a disabled button whose icon is not turning.
    nonisolated static let disabledOpacity = 0.6

    let words: NTextSpec
    let icon: GMIconName?
    let tone: NStatusItemTone
    let open: Bool
    let spin: Bool
    let variant: NStatusItemVariant
    let active: Bool
    let disabled: Bool
    let limit: NStatusItemLimit
    let iconOnly: Bool

    @MainActor
    init(
        text: String, icon: GMIconName?, tone: NStatusItemTone, open: Bool, spin: Bool, variant: NStatusItemVariant,
        active: Bool, disabled: Bool, limit: NStatusItemLimit, iconOnly: Bool
    ) {
        let quiet = variant == .quiet
        // `.accent` comes after `.quiet` in the web's styles, so its weight wins.
        let weight = tone == .accent ? GMFontWeight.semibold : quiet ? GMFontWeight.medium : GMFontWeight.regular
        let font = NTypography.FontKey(
            GMTextStyles.body, size: quiet ? GMFontSize.xsmall : GMFontSize.small, weight: weight)
        words = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: limit != .none,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.icon = icon
        self.tone = tone
        self.open = open
        self.spin = spin
        self.variant = variant
        self.active = active
        self.disabled = disabled
        self.limit = limit
        self.iconOnly = iconOnly
    }

    var iconSize: NIconSize { variant == .quiet ? .compact : .medium }
    var dimmed: Bool { disabled && !spin }
    var gap: CGFloat { variant == .quiet ? GMStatusBarTokens.quietGap : GMStatusBarTokens.itemGap }

    var paddingX: CGFloat {
        if variant == .quiet {
            return GMStatusBarTokens.quietPaddingX
        }
        return iconOnly ? GMStatusBarTokens.iconOnlyPaddingX : GMStatusBarTokens.itemPaddingX
    }

    var maxWords: CGFloat? {
        switch limit {
        case .none: nil
        case .branch: GMStatusBarTokens.branchMaxWidth
        case .operation: GMStatusBarTokens.operationMaxWidth
        }
    }

    /// The turning icon's own tone (a view of its own cannot read the color the canvas works out).
    var spinTone: NText.Tone? {
        switch tone {
        case .accent: .accent
        case .warning: .warning
        case .danger: .danger
        case .default: variant == .quiet ? (active ? .default : .dim) : open ? .default : nil
        }
    }

    /// The words' color, in the web's order: hover, then the tone, the quiet look, an open item, the bar's.
    func color(hovering: Bool, inherited: GMColorToken) -> GMColorToken {
        if hovering {
            return .text
        }
        switch tone {
        case .accent: return .accent
        case .warning: return .warning
        case .danger: return .danger
        case .default:
            if variant == .quiet {
                return active ? .text : .textDim
            }
            return open ? .text : inherited
        }
    }

    /// The words laid out once, cut to the limit.
    @MainActor
    var wordsLayout: NTextEngine.Layout? {
        if words.text.isEmpty {
            return nil
        }
        if let layout = words.state.layout {
            return layout
        }
        let natural = words.layout(width: nil)
        let layout = maxWords.map { natural.width > $0 ? words.layout(width: $0) : natural } ?? natural
        words.state.layout = layout
        return layout
    }

    @MainActor
    func draw(
        size: CGSize, hovering: Bool, inherited: GMColorToken, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        if hovering || open {
            let radius = GMRadius.small
            cg.addPath(
                CGPath(
                    roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius,
                    transform: nil))
            cg.setFillColor(palette.cgColor(.hover))
            cg.fillPath()
        }
        let color = palette.cgColor(color(hovering: hovering, inherited: inherited))
        let origin = words.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let placed = words.state
        if let icon, !spin, let iconLeft = placedIcon.left {
            let points = iconSize.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                // WebKit puts an SVG on whole device pixels.
                let x = ((iconLeft + phase.x) * scale).rounded() / scale
                let y = (((size.height - points) / 2 + phase.y) * scale).rounded() / scale
                cg.saveGState()
                cg.translateBy(x: x, y: y + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        guard let layout = placed.layout, let wordsLeft = placedIcon.words else {
            return
        }
        cg.translateBy(x: wordsLeft + phase.x, y: (size.height - words.line.height) / 2 + phase.y)
        NTextEngine.draw(layout, line: words.line, color: color, strike: nil, scale: scale, in: cg)
    }

    /// Where the icon and the words start from the item's left, set by the frame.
    let placedIcon = NStatusItemSpots()
}

/// The icon's and the words' spots from the item's left.
final class NStatusItemSpots: @unchecked Sendable {
    var left: CGFloat?
    var words: CGFloat?
}

/// The item's flex row: the leading views, the icon, the words, the trailing views, with the gap between each two
/// and the padding around, at the token height; each centered on the row.
struct NStatusItemFrame: Layout {
    let look: NStatusItemLook

    private struct Row {
        var items: [(part: NStatusItemPart.Part, index: Int?, width: CGFloat)] = []
        var width: CGFloat = 0
    }

    private func row(_ subviews: Subviews) -> Row {
        var row = Row()
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        for (index, subview) in subviews.enumerated() where subview[NStatusItemPart.self] == .leading {
            row.items.append((.leading, index, sizes[index].width))
        }
        if look.icon != nil {
            let spin = subviews.indices.first { subviews[$0][NStatusItemPart.self] == .spin }
            row.items.append((.spin, spin, look.iconSize.points))
        }
        if let layout = MainActor.assumeIsolated({ look.wordsLayout }) {
            row.items.append((.face, nil, layout.width))
        }
        for (index, subview) in subviews.enumerated() where subview[NStatusItemPart.self] == .trailing {
            row.items.append((.trailing, index, sizes[index].width))
        }
        let content = row.items.reduce(0) { $0 + $1.width } + CGFloat(max(0, row.items.count - 1)) * look.gap
        row.width = content + 2 * look.paddingX
        return row
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: row(subviews).width, height: GMStatusBarTokens.itemHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let row = row(subviews)
        look.words.state.origin = bounds.origin
        var x = look.paddingX
        for item in row.items {
            switch item.part {
            case .spin:
                look.placedIcon.left = x
            case .face:
                look.placedIcon.words = x
            default:
                break
            }
            if let index = item.index {
                subviews[index].place(
                    at: CGPoint(x: bounds.minX + x, y: bounds.midY), anchor: .leading,
                    proposal: ProposedViewSize(width: item.width, height: nil))
            }
            x += item.width + look.gap
        }
        if let face = subviews.first {
            face.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        }
    }
}
