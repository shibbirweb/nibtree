import NibtreeTokens
import SwiftUI

/// A floating badge at the top of the window that shows a value for a moment, such as the zoom level after zooming
/// in: the Swift side of ui/web `ZoomBadge` (docs/components/ZoomBadge.md). The caller shows it (`open`) and hides it
/// after a short time. Put it in an overlay of the window's content: like the web's `position: fixed` box it takes the
/// whole room and draws the badge centered near the top, which the pointer passes through. One canvas draws it.
public struct NZoomBadge: View {
    private let open: Bool
    private let spec: NTextSpec

    public init(open: Bool = true, text: String) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.codeSmall, weight: GMFontWeight.medium)
        spec = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.open = open
    }

    public var body: some View {
        let spec = spec
        NZoomBadgeLayout(spec: spec, open: open) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let reach = NPopupBox.reach
                    let box = CGRect(x: reach, y: reach, width: size.width - 2 * reach, height: size.height - 2 * reach)
                    guard let layout = spec.state.layout else {
                        return
                    }
                    context.withCGContext { cg in
                        NPopupBox.draw(box, radius: GMZoomBadgeTokens.radius, palette: palette, in: cg)
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + reach + NPopupBox.border
                                + GMZoomBadgeTokens.paddingX,
                            y: origin.y - (origin.y * scale).rounded() / scale + reach + NPopupBox.border
                                + GMZoomBadgeTokens.paddingY)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement()
        .accessibilityLabel(open ? spec.text : "")
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// The whole room on offer, with the badge (its words, padding and border) centered across it, the token down.
private struct NZoomBadgeLayout: Layout {
    let spec: NTextSpec
    let open: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard open, let face = subviews.first else {
            subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: .zero)
            return
        }
        let layout = MainActor.assumeIsolated { spec.state.layout ?? spec.layout(width: nil) }
        spec.state.layout = layout
        let size = CGSize(
            width: layout.width + 2 * (GMZoomBadgeTokens.paddingX + NPopupBox.border),
            height: spec.line.height + 2 * (GMZoomBadgeTokens.paddingY + NPopupBox.border))
        let corner = CGPoint(x: bounds.midX - size.width / 2, y: bounds.minY + GMZoomBadgeTokens.top)
        let reach = NPopupBox.reach
        spec.state.origin = CGPoint(x: corner.x - reach, y: corner.y - reach)
        face.place(
            at: spec.state.origin, anchor: .topLeading,
            proposal: ProposedViewSize(width: size.width + 2 * reach, height: size.height + 2 * reach))
    }
}
