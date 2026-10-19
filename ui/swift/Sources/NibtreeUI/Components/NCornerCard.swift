import NibtreeTokens
import SwiftUI

/// A small card in the bottom right corner of a view, with a message and a button, like "The agent ended" with Restart
/// over a terminal: the Swift side of ui/web `CornerCard` (docs/components/CornerCard.md). Put it in an overlay of the
/// view: like the web's absolutely placed box it takes the whole room and draws the card at the corner, inset by the
/// token. The `action` is the caller's view, such as a small `NButton`. One canvas draws the box, its shadow and the
/// message; the action is the only other view.
public struct NCornerCard<Action: View>: View {
    private let spec: NTextSpec
    private let action: Action

    public init(message: String, @ViewBuilder action: () -> Action) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small)
        spec = NTextSpec(
            text: message, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .textDim, strike: false)
        self.action = action()
    }

    public var body: some View {
        let spec = spec
        NCornerCardLayout(spec: spec) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let reach = NPopupBox.reach
                    let box = CGRect(x: reach, y: reach, width: size.width - 2 * reach, height: size.height - 2 * reach)
                    context.withCGContext { cg in
                        NPopupBox.draw(box, radius: GMRadius.menu, palette: palette, in: cg)
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // SwiftUI put the canvas on whole device pixels; the words keep the fractions WebKit draws at.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + box.minX + NPopupBox.border
                                + GMCornerCardTokens.paddingLeft,
                            y: origin.y - (origin.y * scale).rounded() / scale + (size.height - spec.line.height) / 2)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
            action
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spec.text)
    }
}

extension NCornerCard where Action == EmptyView {
    /// A card with the message only.
    public init(message: String) {
        self.init(message: message) { EmptyView() }
    }
}

/// The whole room on offer, with the card at its own size in the bottom right corner, inset by the token: the message
/// and the action in a row, centered on each other, inside the padding and border.
private struct NCornerCardLayout: Layout {
    let spec: NTextSpec

    private static let border = NPopupBox.border

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions(by: .zero)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let face = subviews.first else {
            return
        }
        let layout = MainActor.assumeIsolated { spec.state.layout ?? spec.layout(width: nil) }
        spec.state.layout = layout
        let action = subviews.dropFirst().first.map { $0.sizeThatFits(.unspecified) } ?? .zero
        let (border, inset) = (Self.border, GMCornerCardTokens.inset)
        let gap = action.width > 0 ? GMCornerCardTokens.gap : 0
        let content = CGSize(
            width: layout.width + gap + action.width, height: max(spec.line.height, action.height))
        let size = CGSize(
            width: content.width + GMCornerCardTokens.paddingLeft + GMCornerCardTokens.paddingRight + 2 * border,
            height: content.height + 2 * (GMCornerCardTokens.paddingY + border))
        let card = CGRect(
            x: bounds.maxX - inset - size.width, y: bounds.maxY - inset - size.height, width: size.width,
            height: size.height)
        let reach = NPopupBox.reach
        face.place(
            at: CGPoint(x: card.minX - reach, y: card.minY - reach), anchor: .topLeading,
            proposal: ProposedViewSize(width: size.width + 2 * reach, height: size.height + 2 * reach))
        let left = card.minX + border + GMCornerCardTokens.paddingLeft
        let middle = card.minY + border + GMCornerCardTokens.paddingY + content.height / 2
        spec.state.origin = CGPoint(x: card.minX - reach, y: card.minY - reach)
        subviews.dropFirst().first?.place(
            at: CGPoint(x: left + layout.width + gap, y: middle), anchor: .leading, proposal: ProposedViewSize(action))
    }
}
