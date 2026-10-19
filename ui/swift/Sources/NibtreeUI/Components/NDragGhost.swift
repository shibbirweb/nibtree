import NibtreeTokens
import SwiftUI

/// The label that follows the pointer while files are dragged, such as "3 files" in the Files panel: the Swift side of
/// ui/web `DragGhost` (docs/components/DragGhost.md). `x` and `y` are the pointer's position in the view it covers
/// (data); the ghost sits just below and to the right of it. Put it in an overlay of the window's content: like the
/// web's `position: fixed` box it takes the whole room and draws only the label, which the pointer passes through.
public struct NDragGhost: View {
    private let spec: NTextSpec
    private let x: Double
    private let y: Double

    public init(text: String, x: Double, y: Double) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        spec = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: true,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .text, strike: false)
        self.x = x
        self.y = y
    }

    public var body: some View {
        let spec = spec
        NDragGhostFrame(spec: spec, spot: CGPoint(x: x, y: y)) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    guard let layout = spec.state.layout else {
                        return
                    }
                    let origin = spec.state.origin
                    context.withCGContext { cg in
                        // The canvas sits at the box's corner on whole device pixels; the words where WebKit puts them.
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + NDragGhostFrame.inset.width,
                            y: origin.y - (origin.y * scale).rounded() / scale + NDragGhostFrame.inset.height)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(.text), strike: nil, scale: scale, in: cg)
                    }
                }
            }
            .background { NPopupBox(radius: GMRadius.control) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The whole room on offer, with the label at the pointer plus the token offset: its words and padding wide, at most
/// the token's max width (the words cut with an ellipsis).
struct NDragGhostFrame: Layout {
    let spec: NTextSpec
    let spot: CGPoint

    static let inset = CGSize(
        width: GMDragGhostTokens.paddingX + NPopupBox.border, height: GMDragGhostTokens.paddingY + NPopupBox.border)

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let inset = Self.inset
        let natural = MainActor.assumeIsolated { spec.layout(width: nil) }
        let width = min(natural.width + 2 * inset.width, GMDragGhostTokens.maxWidth)
        spec.state.layout = MainActor.assumeIsolated { spec.layout(width: width - 2 * inset.width) }
        let corner = CGPoint(
            x: bounds.minX + spot.x + GMDragGhostTokens.offsetX, y: bounds.minY + spot.y + GMDragGhostTokens.offsetY)
        spec.state.origin = corner
        subviews.first?.place(
            at: corner, anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: spec.line.height + 2 * inset.height))
    }
}
