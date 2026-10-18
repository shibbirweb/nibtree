import NibtreeTokens
import SwiftUI

/// A bordered box that groups rows, like a worktree card in the AI panel: the Swift side of ui/web `Card`
/// (docs/components/Card.md). `selected` marks the chosen one with an accent border, `dim` fades one whose folder is
/// gone, and `padded` adds room for free content. Like the web's block it stacks its children, each as wide as the
/// card, and it always fills its stack's cross axis (`align-self: stretch`).
public struct NCard<Content: View>: View {
    private let label: String?
    private let padded: Bool
    private let selected: Bool
    private let dim: Bool
    private let content: Content

    public init(
        label: String? = nil, padded: Bool = false, selected: Bool = false, dim: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.label = label
        self.padded = padded
        self.selected = selected
        self.dim = dim
        self.content = content()
    }

    public var body: some View {
        NCardLayout(padded: padded) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    context.withCGContext { cg in
                        NCardFace.draw(
                            size: size, in: cg, border: palette.cgColor(selected ? .accent : .border),
                            fill: palette.cgColor(.panel))
                    }
                }
            }
            content
        }
        .layoutValue(key: NStackAlignSelf.self, value: .stretch)
        .opacity(dim ? NCardFace.dimOpacity : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label ?? "")
    }
}

/// The card's panel color under a 1 point border, both following the rounded corners.
enum NCardFace {
    /// Card.svelte's `.faded`: the web library writes its opacities in the component, not as tokens.
    static let dimOpacity = 0.7

    static func draw(size: CGSize, in cg: CGContext, border: CGColor, fill: CGColor) {
        let radius = GMCardTokens.radius
        let outer = CGPath(
            roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.setFillColor(fill)
        cg.addPath(outer)
        cg.fillPath()
        // CSS paints the border over the background, so a see-through border color blends with the panel.
        let inner = CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)
        cg.addPath(outer)
        cg.addPath(CGPath(
            roundedRect: inner, cornerWidth: radius - 1, cornerHeight: radius - 1, transform: nil))
        cg.setFillColor(border)
        cg.fillPath(using: .evenOdd)
    }
}

/// A CSS block: the border and padding around children stacked top to bottom, each as wide as the inside. The first
/// subview is the face, drawn under the whole box. Without a width on offer (a row) the card is as wide as its
/// widest child; a height on offer (a row stretching it) is kept when it is more than the content.
private struct NCardLayout: Layout {
    let padded: Bool

    private var insets: EdgeInsets {
        let x = 1 + (padded ? GMSpace.s6 : 0)
        let y = 1 + (padded ? GMSpace.s6 : GMCardTokens.paddingY)
        return EdgeInsets(top: y, leading: x, bottom: y, trailing: x)
    }

    private func children(_ subviews: Subviews, width: CGFloat?) -> [CGSize] {
        subviews.dropFirst().map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let insets = insets
        let room = proposal.width.flatMap { $0.isFinite ? max(0, $0 - insets.leading - insets.trailing) : nil }
        let sizes = children(subviews, width: room)
        let width = (room ?? sizes.map(\.width).max() ?? 0) + insets.leading + insets.trailing
        let height = sizes.reduce(0) { $0 + $1.height } + insets.top + insets.bottom
        guard let offer = proposal.height, offer.isFinite else {
            return CGSize(width: width, height: height)
        }
        return CGSize(width: width, height: max(offer, height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let face = subviews.first else {
            return
        }
        face.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        let insets = insets
        let width = max(0, bounds.width - insets.leading - insets.trailing)
        var y = bounds.minY + insets.top
        for (subview, size) in zip(subviews.dropFirst(), children(subviews, width: width)) {
            subview.place(
                at: CGPoint(x: bounds.minX + insets.leading, y: y), anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: size.height))
            y += size.height
        }
    }
}
