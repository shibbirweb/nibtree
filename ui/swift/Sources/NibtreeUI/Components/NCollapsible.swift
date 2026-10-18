import NibtreeTokens
import SwiftUI

/// A section with a header that opens and closes it: a chevron, a bold title, a count and actions, like the Changes
/// list's groups: the Swift side of ui/web `Collapsible` (docs/components/Collapsible.md). The web's `ontoggle` is the
/// binding's own setter and its `children` are `content`, shown while open. The web hides icon buttons among the
/// actions until the header is hovered; SwiftUI cannot pick children by type, so `actions` is told whether the header
/// is hovered and shows its icon buttons only then (a worded button, such as Resolve..., always shows).
public struct NCollapsible<Content: View, Actions: View>: View {
    @Binding private var open: Bool
    private let look: NCollapsibleLook
    private let content: Content
    private let actions: (Bool) -> Actions
    @State private var hovering = false

    public init(
        title: String, open: Binding<Bool>, count: Int? = nil, nested: Bool = false, dim: Bool = false,
        @ViewBuilder actions: @escaping (_ hovering: Bool) -> Actions, @ViewBuilder content: () -> Content
    ) {
        _open = open
        look = NCollapsibleLook(title: title, open: open.wrappedValue, count: count, nested: nested, dim: dim)
        self.actions = actions
        self.content = content()
    }

    public var body: some View {
        NCollapsibleFrame {
            NCollapsibleHeaderFrame(look: look) {
                NCollapsibleFace(look: look, hovering: hovering)
                    .onTapGesture { open.toggle() }
                    .accessibilityRepresentation {
                        Button(look.title.text) { open.toggle() }
                            .accessibilityValue(open ? "expanded" : "collapsed")
                    }
                actions(hovering)
            }
            .onHover { hovering = $0 }
            if open {
                content
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.title.text)
    }
}

extension NCollapsible where Actions == EmptyView {
    public init(
        title: String, open: Binding<Bool>, count: Int? = nil, nested: Bool = false, dim: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.init(title: title, open: open, count: count, nested: nested, dim: dim, actions: { _ in EmptyView() },
            content: content)
    }
}

/// The header's words and sizes, worked out once from the props.
struct NCollapsibleLook: Sendable {
    let title: NTextSpec
    let count: NTextSpec?
    let open: Bool
    let paddingLeft: CGFloat

    /// Collapsible.svelte's `.toggle` padding and the chevron's size.
    nonisolated static let togglePadding = GMSpace.s2
    nonisolated static let chevron = NIconSize.medium.points

    @MainActor
    init(title: String, open: Bool, count: Int?, nested: Bool, dim: Bool) {
        let font = NTypography.FontKey(GMTextStyles.body, weight: GMFontWeight.semibold)
        self.title = NTextSpec(
            text: title, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: dim ? .textDim : .text, strike: false)
        self.count = count.map { count in
            let small = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
            return NTextSpec(
                text: String(count), font: small, kerning: 0, tabular: false, truncate: false,
                line: NTextMetrics.lineBox(small, lineHeight: nil), tone: .textDim, strike: false)
        }
        self.open = open
        paddingLeft = nested ? GMCollapsibleTokens.nestedIndent : GMCollapsibleTokens.paddingLeft
    }

    @MainActor
    static func lines(_ spec: NTextSpec) -> NTextEngine.Layout {
        let layout = spec.state.layout ?? spec.layout(width: nil)
        spec.state.layout = layout
        return layout
    }
}

/// The section: the header, then the open content below it, as wide as offered like a CSS block.
private struct NCollapsibleFrame: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
        return CGSize(width: width ?? sizes.map(\.width).max() ?? 0, height: sizes.map(\.height).reduce(0, +))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        let offer = ProposedViewSize(width: bounds.width, height: nil)
        for subview in subviews {
            let height = subview.sizeThatFits(offer).height
            subview.place(
                at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: height))
            y += height
        }
    }
}

/// The header row: the drawn toggle across the room the actions leave, the actions at the right.
private struct NCollapsibleHeaderFrame: Layout {
    let look: NCollapsibleLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let actions = subviews.count > 1 ? subviews[1].sizeThatFits(.unspecified).width : 0
        let natural = MainActor.assumeIsolated {
            look.paddingLeft + 2 * NCollapsibleLook.togglePadding + NCollapsibleLook.chevron + GMCollapsibleTokens.gap
                + NCollapsibleLook.lines(look.title).width
                + (look.count.map { GMCollapsibleTokens.gap + NCollapsibleLook.lines($0).width } ?? 0)
        }
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
            ?? natural + (actions > 0 ? GMSpace.s2 + actions : 0) + GMCollapsibleTokens.paddingRight
        return CGSize(width: width, height: GMCollapsibleTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.title.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        if subviews.count > 1 {
            let spot = CGPoint(x: bounds.maxX - GMCollapsibleTokens.paddingRight, y: bounds.midY)
            subviews[1].place(at: spot, anchor: .trailing, proposal: .unspecified)
        }
    }
}

/// The header's hover background, chevron, title and count, in one canvas.
private struct NCollapsibleFace: View {
    let look: NCollapsibleLook
    let hovering: Bool

    var body: some View {
        let (look, hovering) = (look, hovering)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    Self.draw(look, hovering: hovering, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
    }

    @MainActor
    private static func draw(
        _ look: NCollapsibleLook, hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        if hovering {
            cg.setFillColor(palette.cgColor(.hover))
            cg.fill(CGRect(origin: .zero, size: size))
        }
        let origin = look.title.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        let color = palette.cgColor(look.title.tone)
        let points = NCollapsibleLook.chevron
        var x = look.paddingLeft + NCollapsibleLook.togglePadding
        let key = NIconImages.Key(
            name: look.open ? .chevronDown : .chevronRight, points: points, lineWidth: NIconStroke.normal.width,
            scale: scale, color: color)
        if let image = NIconImages.image(key, color: color) {
            // WebKit puts an SVG on whole device pixels.
            let left = ((x + phase.x) * scale).rounded() / scale
            let top = (((size.height - points) / 2 + phase.y) * scale).rounded() / scale
            cg.saveGState()
            cg.translateBy(x: left, y: top + points)
            cg.scaleBy(x: 1, y: -1)
            cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
            cg.restoreGState()
        }
        x += points + GMCollapsibleTokens.gap
        for spec in [look.title, look.count].compactMap({ $0 }) {
            let layout = NCollapsibleLook.lines(spec)
            cg.saveGState()
            cg.translateBy(x: x + phase.x, y: (size.height - spec.line.height) / 2 + phase.y)
            NTextEngine.draw(
                layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg)
            cg.restoreGState()
            x += layout.width + GMCollapsibleTokens.gap
        }
    }
}
