import NibtreeTokens
import SwiftUI

/// A side nav's look: `settings` (Settings' sections), `large` (the Welcome page's sections) or `links` (dim links
/// with icons under them, never marked open).
public enum NSideNavVariant: String, CaseIterable, Sendable {
    case settings, large, links
}

/// One section of an `NSideNav`: its id, its words, an optional icon, and whether it is a danger (Reset, in red).
public struct NSideNavItem: Sendable {
    public let id: String
    public let label: String
    public let icon: GMIconName?
    public let danger: Bool

    public init(id: String, label: String, icon: GMIconName? = nil, danger: Bool = false) {
        self.id = id
        self.label = label
        self.icon = icon
        self.danger = danger
    }
}

/// A vertical list of sections with the open one marked, like Settings' Appearance, Editor, Git: the Swift side of
/// ui/web `SideNav` (docs/components/SideNav.md). A click opens a section (`active`) and calls `onSelect`; with the
/// keyboard's focus, Up and Down move the open one. `emptyText` shows when there are no items, such as a search that
/// finds no section. One canvas draws every item.
public struct NSideNav: View {
    private let items: [NSideNavItem]
    @Binding private var active: String?
    private let label: String
    private let onSelect: ((String) -> Void)?
    private let look: NSideNavLook
    @State private var hovered: Int?

    public init(
        items: [NSideNavItem], active: Binding<String?>, label: String, variant: NSideNavVariant = .settings,
        emptyText: String = "", onSelect: ((String) -> Void)? = nil
    ) {
        self.items = items
        _active = active
        self.label = label
        self.onSelect = onSelect
        look = NSideNavLook(items: items, active: active.wrappedValue, variant: variant, emptyText: emptyText)
    }

    private func open(_ index: Int?) {
        guard let index, items.indices.contains(index) else {
            return
        }
        active = items[index].id
        onSelect?(items[index].id)
    }

    public var body: some View {
        let (look, hot) = (look, hovered)
        NSideNavFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovered: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onContinuousHover { phase in
            switch phase {
            case .active(let spot): hovered = look.placed.index(at: spot.y)
            case .ended: hovered = nil
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in open(look.placed.index(at: spot.y)) }
        .focusable(!items.isEmpty)
        .onKeyPress(keys: [.upArrow, .downArrow]) { press in
            let current = items.firstIndex { $0.id == active } ?? (press.key == .upArrow ? items.count : -1)
            open(min(items.count - 1, max(0, current + (press.key == .upArrow ? -1 : 1))))
            return .handled
        }
        .accessibilityRepresentation {
            VStack {
                ForEach(items.indices, id: \.self) { index in
                    Button(items[index].label) { open(index) }
                        .accessibilityAddTraits(items[index].id == active ? .isSelected : [])
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }
}

/// The items' words and where each item went.
struct NSideNavLook: Sendable {
    let variant: NSideNavVariant
    let labels: [NTextSpec]
    let icons: [GMIconName?]
    let dangers: [Bool]
    let chosen: Int?
    let empty: NTextSpec?
    let placed = NChoiceListPlaced()

    @MainActor
    init(items: [NSideNavItem], active: String?, variant: NSideNavVariant, emptyText: String) {
        self.variant = variant
        chosen = items.firstIndex { $0.id == active }
        let spec = { (text: String, font: NTypography.FontKey) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        }
        labels = items.indices.map { index in
            let item = items[index]
            let medium = variant == .settings && item.id == active ? GMFontWeight.medium : nil
            let size = item.danger ? GMFontSize.small : nil
            return spec(item.label, NTypography.FontKey(GMTextStyles.body, size: size, weight: medium))
        }
        icons = items.map(\.icon)
        dangers = items.map(\.danger)
        empty = items.isEmpty && !emptyText.isEmpty ? spec(emptyText, NTypography.FontKey(GMTextStyles.body)) : nil
    }

    var paddingX: CGFloat { variant == .settings ? GMSideNavTokens.itemPaddingX : GMSideNavTokens.largePaddingX }
    var gap: CGFloat { variant == .links ? GMSideNavTokens.linkGap : 0 }

    /// The width with nothing on offer: the widest item's words, icon and padding.
    @MainActor
    var naturalWidth: CGFloat {
        let words: [CGFloat] = labels.map { NTextMetrics.width(of: $0.text, font: $0.font, kerning: 0) }
        let icon: CGFloat = icons.contains { $0 != nil } ? NIconSize.normal.points + gap : 0
        return (words.max() ?? 0) + 2 * paddingX + icon
    }

    /// Each item's height in a nav `width` wide, laying the words out for drawing. A settings item's icon is a block
    /// of its own above the words, as WebKit lays out the button's SVG.
    @MainActor
    func heights(width: CGFloat) -> [CGFloat] {
        let pad = GMSideNavTokens.itemPaddingY
        if let empty {
            let layout = empty.layout(width: max(0, width - 2 * GMSideNavTokens.itemPaddingX))
            empty.state.layout = layout
            return [2 * pad + CGFloat(layout.lines.count) * empty.line.height]
        }
        return labels.indices.map { index in
            switch variant {
            case .settings:
                let layout = labels[index].layout(width: max(0, width - 2 * paddingX))
                labels[index].state.layout = layout
                let icon = icons[index] == nil ? 0 : NIconSize.normal.points
                return 2 * pad + icon + CGFloat(layout.lines.count) * labels[index].line.height
            case .large, .links:
                labels[index].state.layout = labels[index].layout(width: nil)
                return variant == .large ? GMSideNavTokens.largeHeight : GMSideNavTokens.linkHeight
            }
        }
    }

    @MainActor
    func draw(hovered: Int?, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let pad = GMSideNavTokens.itemPaddingY
        if let empty, let layout = empty.state.layout {
            cg.translateBy(x: GMSideNavTokens.itemPaddingX, y: pad)
            NTextEngine.draw(layout, line: empty.line, color: palette.cgColor(.textDim), strike: nil, scale: scale,
                in: cg)
            return
        }
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        for index in labels.indices where placed.tops.indices.contains(index) {
            let box = CGRect(x: 0, y: placed.tops[index], width: size.width, height: placed.heights[index])
            // Hover outweighs the open item's color (`:hover` is the weightier rule); an open link has none.
            let fill: GMColorToken? = index == hovered && !(variant == .links && index == chosen)
                ? .hover : index == chosen && variant != .links ? .selected : nil
            if let fill {
                let radius = GMSideNavTokens.radius
                cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
                cg.setFillColor(palette.cgColor(fill))
                cg.fillPath()
            }
            let tone: GMColorToken = dangers[index]
                ? .danger : variant == .links && index != hovered ? .textDim : .text
            let color = palette.cgColor(tone)
            let spec = labels[index]
            var x = paddingX
            var top = variant == .settings ? box.minY + pad : box.minY + (box.height - spec.line.height) / 2
            if let icon = icons[index] {
                let points = NIconSize.normal.points
                let key = NIconImages.Key(
                    name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
                if let image = NIconImages.image(key, color: color) {
                    let y = variant == .settings ? box.minY + pad : box.minY + (box.height - points) / 2
                    cg.saveGState()
                    cg.translateBy(x: pixel(x), y: pixel(y) + points)
                    cg.scaleBy(x: 1, y: -1)
                    cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                    cg.restoreGState()
                }
                if variant == .settings {
                    top += points
                } else {
                    x += points + gap
                }
            }
            guard let layout = spec.state.layout else {
                continue
            }
            cg.saveGState()
            cg.translateBy(x: x, y: top)
            NTextEngine.draw(layout, line: spec.line, color: color, strike: nil, scale: scale, in: cg, phase: top)
            cg.restoreGState()
        }
    }
}

/// The nav's size: its items stacked with the gap between them, as wide as the room on offer; the canvas fills it.
private struct NSideNavFrame: Layout {
    let look: NSideNavLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? MainActor.assumeIsolated { look.naturalWidth }
        let heights = MainActor.assumeIsolated { look.heights(width: width) }
        return CGSize(
            width: width,
            height: heights.reduce(0, +) + CGFloat(max(0, heights.count - 1)) * GMSideNavTokens.gap)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let heights = MainActor.assumeIsolated { look.heights(width: bounds.width) }
        var y: CGFloat = 0
        look.placed.tops = heights.map { height in
            defer { y += height + GMSideNavTokens.gap }
            return y
        }
        look.placed.heights = look.empty == nil ? heights : []
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
