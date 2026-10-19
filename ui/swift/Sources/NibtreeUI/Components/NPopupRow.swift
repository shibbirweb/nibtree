import NibtreeTokens
import SwiftUI

/// `action` is an icon and its words, lit under the pointer; `item` a grid of an icon, a name, a dim hint and a
/// chevron.
public enum NPopupRowVariant: String, CaseIterable, Sendable {
    case action, item
}

/// A row of a picker popup, like the branches popup: the Swift side of ui/web `PopupRow` (docs/components/PopupRow.md).
/// An action or an item whose name is bold when `current`; the highlighted row takes the selection color. As wide as
/// its popup; one canvas draws it.
public struct NPopupRow: View {
    private let look: NPopupRowLook
    private let action: (() -> Void)?
    private let onHover: (() -> Void)?
    @State private var hovering = false

    public init(
        label: String, variant: NPopupRowVariant = .item, icon: GMIconName? = nil, hint: String = "",
        current: Bool = false, chevron: Bool = false, highlighted: Bool = false, disabled: Bool = false,
        action: (() -> Void)? = nil, onHover: (() -> Void)? = nil
    ) {
        look = NPopupRowLook(
            label: label, variant: variant, icon: icon, hint: hint, current: current, chevron: chevron,
            highlighted: highlighted, disabled: disabled)
        self.action = action
        self.onHover = onHover
    }

    public var body: some View {
        let (look, hot) = (look, hovering && !look.disabled)
        NPopupRowFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovering: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onHover { inside in
            hovering = inside
            if inside, !look.disabled {
                onHover?()
            }
        }
        .onTapGesture {
            if !look.disabled {
                action?()
            }
        }
        .accessibilityElement()
        .accessibilityLabel(look.name.text)
        .accessibilityAddTraits(look.highlighted ? [.isButton, .isSelected] : .isButton)
    }
}

/// Everything a popup row draws, from PopupRow.svelte's classes.
struct NPopupRowLook: Sendable {
    let name: NTextSpec
    let hint: NTextSpec?
    let variant: NPopupRowVariant
    let icon: GMIconName?
    let chevron: Bool
    let highlighted: Bool
    let disabled: Bool
    let placed = NPopupRowPlaced()

    @MainActor
    init(
        label: String, variant: NPopupRowVariant, icon: GMIconName?, hint: String, current: Bool, chevron: Bool,
        highlighted: Bool, disabled: Bool
    ) {
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: true,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        let font = NTypography.FontKey(GMTextStyles.body, weight: current ? GMFontWeight.semibold : nil)
        name = spec(label, font, variant == .action && disabled ? .textFaint : .text)
        self.hint =
            variant == .item && !hint.isEmpty
            ? spec(hint, NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small), .textFaint) : nil
        self.variant = variant
        self.icon = icon
        self.chevron = chevron
        self.highlighted = highlighted
        self.disabled = disabled
    }

    var item: Bool { variant == .item }

    /// Where the name starts: the icon's column (an item always keeps it; an action only with an icon) and the gap.
    var nameLeft: CGFloat {
        let column = item ? GMPopupRowTokens.iconColumn : icon == nil ? 0 : NIconSize.normal.points
        return GMPopupRowTokens.paddingX + (column > 0 ? column + GMPopupRowTokens.gap : 0)
    }

    var height: CGFloat {
        let words = max(name.line.height, hint?.line.height ?? 0)
        return max(words, icon == nil ? 0 : NIconSize.normal.points) + 2 * GMPopupRowTokens.paddingY
    }

    /// The name's and hint's widths in a row `width` wide: the hint at most its own (capped) width, the name the rest,
    /// as the grid's `minmax(0, 1fr) minmax(0, auto)` columns share it.
    @MainActor
    func columns(width: CGFloat?) -> (name: CGFloat, hint: CGFloat) {
        let nameNatural = name.layout(width: nil).width
        guard item else {
            let room = width.map { $0 - nameLeft - GMPopupRowTokens.paddingX } ?? nameNatural
            return (min(nameNatural, max(0, room)), 0)
        }
        let hintNatural = hint.map { min($0.layout(width: nil).width, GMPopupRowTokens.hintMaxWidth) } ?? 0
        let fixed = nameLeft + 2 * GMPopupRowTokens.gap + GMPopupRowTokens.chevronColumn + GMPopupRowTokens.paddingX
        guard let width else {
            return (nameNatural, hintNatural)
        }
        let room = max(0, width - fixed)
        let hintWidth = min(hintNatural, room)
        return (room - hintWidth, hintWidth)
    }

    @MainActor
    func draw(hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let fill: GMColorToken? = highlighted ? .selected : hovering && !item ? .hover : nil
        if let fill {
            let radius = GMRadius.control
            cg.addPath(
                CGPath(
                    roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius,
                    transform: nil))
            cg.setFillColor(palette.cgColor(fill))
            cg.fillPath()
        }
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let phase = CGPoint(x: origin.x - pixel(origin.x), y: origin.y - pixel(origin.y))
        let color = palette.cgColor(name.tone)
        var icons: [(GMIconName, NIconSize, CGFloat)] = []
        if let icon {
            icons.append((icon, .normal, GMPopupRowTokens.paddingX))
        }
        if chevron && item {
            icons.append((.chevronRight, .compact, placed.chevronLeft))
        }
        for (glyph, iconSize, left) in icons {
            let points = iconSize.points
            let key = NIconImages.Key(
                name: glyph, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                cg.saveGState()
                cg.translateBy(x: pixel(left + phase.x), y: pixel((size.height - points) / 2 + phase.y) + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        for (spec, left) in [(name, nameLeft), (hint, placed.hintLeft)] {
            guard let spec, let layout = spec.state.layout else {
                continue
            }
            cg.saveGState()
            cg.translateBy(x: left + phase.x, y: (size.height - spec.line.height) / 2 + phase.y)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg)
            cg.restoreGState()
        }
    }
}

/// Where the hint and chevron went, set by the frame.
final class NPopupRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var hintLeft: CGFloat = 0
    var chevronLeft: CGFloat = 0
}

/// As wide as offered (a popup's width), its words cut to their columns.
private struct NPopupRowFrame: Layout {
    let look: NPopupRowLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let natural = MainActor.assumeIsolated {
            let columns = look.columns(width: nil)
            let item = look.item
            return look.nameLeft + columns.name + GMPopupRowTokens.paddingX
                + (item ? columns.hint + 2 * GMPopupRowTokens.gap + GMPopupRowTokens.chevronColumn : 0)
        }
        return CGSize(width: width ?? natural, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let columns = look.columns(width: bounds.width)
            look.name.state.layout = look.name.layout(width: columns.name + 0.01)
            look.hint?.state.layout = look.hint?.layout(width: columns.hint + 0.01)
            look.placed.hintLeft = look.nameLeft + columns.name + GMPopupRowTokens.gap
            look.placed.chevronLeft = look.placed.hintLeft + columns.hint + GMPopupRowTokens.gap
        }
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
