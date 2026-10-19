import NibtreeTokens
import SwiftUI

/// A panel's header: its title in small capitals (and a quiet count) on the left and its action buttons on the right,
/// like the Changes, Files and terminal panels: the Swift side of ui/web `PanelHeader`
/// (docs/components/PanelHeader.md).
/// Put `NIconButton`s with size `compact` in `actions`. The title gives way first in a narrow panel, ending in an
/// ellipsis, so the buttons never run into each other. One canvas draws the title and the line under the header.
public struct NPanelHeader<Actions: View>: View {
    private let spec: NTextSpec
    private let count: Int?
    private let actions: Actions

    public init(title: String, count: Int? = nil, @ViewBuilder actions: () -> Actions) {
        let style = GMTextStyles.panelTab
        let font = NTypography.FontKey(style)
        spec = NTextSpec(
            text: style.uppercase ? title.uppercased() : title, font: font, kerning: style.letterSpacing * font.size,
            tabular: false, truncate: true, line: NTextMetrics.lineBox(font, lineHeight: style.lineHeight),
            tone: .textDim, strike: false)
        self.count = count
        self.actions = actions()
    }

    public var body: some View {
        let spec = spec
        NPanelHeaderLayout(spec: spec, counted: count != nil) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        cg.setFillColor(palette.cgColor(.borderStrong))
                        cg.fill(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1))
                        guard let layout = spec.state.layout else {
                            return
                        }
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + GMPanelHeaderTokens.paddingLeft,
                            y: origin.y - (origin.y * scale).rounded() / scale
                                + (size.height - 1 - spec.line.height) / 2)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
            if let count {
                NBadge(count: count, tone: .quiet, size: .large)
            }
            actions
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spec.text)
        .accessibilityAddTraits(.isHeader)
    }
}

extension NPanelHeader where Actions == EmptyView {
    /// A header with a title (and a count) only.
    public init(title: String, count: Int? = nil) {
        self.init(title: title, count: count) { EmptyView() }
    }
}

/// The header's flex row: the title, the count, a growing gap, then the actions at the end, each centered over the
/// line; the title is cut to the room the others leave. The first subview is the face, the second the count when
/// there is one.
private struct NPanelHeaderLayout: Layout {
    let spec: NTextSpec
    let counted: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? MainActor.assumeIsolated {
            natural(subviews)
        }
        return CGSize(width: width, height: GMPanelHeaderTokens.height)
    }

    /// The widths of the count and actions after the face, and the gaps the row puts between its items.
    private func others(_ subviews: Subviews) -> (sizes: [CGSize], gaps: CGFloat) {
        let sizes = subviews.dropFirst().map { $0.sizeThatFits(.unspecified) }
        // Items: the title, the count, the spacer, the actions; one gap between each two.
        let gaps = CGFloat(sizes.count + 1) * GMPanelHeaderTokens.gap
        return (sizes, gaps)
    }

    @MainActor
    private func natural(_ subviews: Subviews) -> CGFloat {
        let (sizes, gaps) = others(subviews)
        return GMPanelHeaderTokens.paddingLeft + spec.layout(width: nil).width + gaps
            + sizes.reduce(0) { $0 + $1.width } + GMPanelHeaderTokens.paddingRight
    }

    /// The title's, the count's and the actions' widths in `width`, as CSS flex-shrink gives them out when the header
    /// is too narrow: the title down to nothing, the count never, each action down to the header's button size.
    @MainActor
    func widths(_ subviews: Subviews, width: CGFloat) -> [CGFloat] {
        let (sizes, gaps) = others(subviews)
        let title = spec.layout(width: nil).width
        let basis = [title] + sizes.map(\.width)
        let least = [0] + sizes.enumerated().map { index, size in
            counted && index == 0 ? size.width : min(size.width, GMPanelHeaderTokens.buttonSize)
        }
        let inner = [title] + sizes.enumerated().map { index, size in
            counted && index == 0 ? size.width : max(0, size.width - 2 * GMIconButtonTokens.paddingX)
        }
        let available = width - GMPanelHeaderTokens.paddingLeft - GMPanelHeaderTokens.paddingRight - gaps
        return NCrumbMath.widths(
            basis: basis, inner: inner, least: least, shrink: basis.map { _ in 1 }, available: available)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let face = subviews.first else {
            return
        }
        let (sizes, _) = others(subviews)
        let widths = MainActor.assumeIsolated { self.widths(subviews, width: bounds.width) }
        let title = widths[0]
        MainActor.assumeIsolated {
            let natural = spec.layout(width: nil)
            spec.state.layout = natural.width <= title + 0.01 ? natural : spec.layout(width: title)
        }
        spec.state.origin = bounds.origin
        face.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        let middle = bounds.minY + (GMPanelHeaderTokens.height - 1) / 2
        var x = bounds.minX + GMPanelHeaderTokens.paddingLeft + title + GMPanelHeaderTokens.gap
        let views = Array(subviews.dropFirst())
        if counted, let badge = views.first {
            badge.place(at: CGPoint(x: x, y: middle), anchor: .leading, proposal: ProposedViewSize(sizes[0]))
        }
        // The actions sit at the end, the last against the right padding.
        x = bounds.maxX - GMPanelHeaderTokens.paddingRight
        let actions = zip(views, zip(sizes, widths.dropFirst())).dropFirst(counted ? 1 : 0)
        for (view, (size, width)) in actions.reversed() {
            view.place(
                at: CGPoint(x: x, y: middle), anchor: .trailing,
                proposal: ProposedViewSize(width: width, height: size.height))
            x -= width + GMPanelHeaderTokens.gap
        }
    }
}
