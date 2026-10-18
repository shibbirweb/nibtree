import NibtreeTokens
import SwiftUI

/// A tiny box with one to three letters that names a tool, such as an AI agent ("CC" for Claude Code): the Swift side
/// of ui/web `Mark` (docs/components/Mark.md). `normal` is a fixed box before a row; `small` is the status bar's size,
/// as wide as its letters (or the stack, when a column stretches it) and in the text color. The web's `title` is
/// SwiftUI's own `.help("Claude Code")` on the mark: a tooltip costs as much as the mark, so only titled marks pay.
public struct NMark: View {
    public enum Size: String, CaseIterable, Sendable {
        case normal, small
    }

    private let spec: NTextSpec
    private let size: Size

    public init(text: String, size: Size = .normal) {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.nano, weight: GMFontWeight.bold)
        let lineHeight = size == .small ? Double(GMMarkTokens.smallLineHeight / GMFontSize.nano) : nil
        spec = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: lineHeight), tone: size == .small ? .text : .textDim,
            strike: false)
        self.size = size
    }

    public var body: some View {
        NMarkFrame(spec: spec, size: size) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let radius = size == .small ? GMMarkTokens.smallRadius : GMRadius.small
                    context.withCGContext { cg in
                        cg.setFillColor(palette.cgColor(.hover))
                        cg.addPath(CGPath(
                            roundedRect: CGRect(origin: .zero, size: box), cornerWidth: radius, cornerHeight: radius,
                            transform: nil))
                        cg.fillPath()
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // Flex centering puts the letters at fractions of a point, as WebKit draws them; SwiftUI
                        // rounded the box's spot. Three letters can be wider than the box and overflow both sides.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + (box.width - layout.width) / 2,
                            y: origin.y - (origin.y * scale).rounded() / scale + (box.height - spec.line.height) / 2)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(spec.text)
    }
}

/// Sizes the mark like the web's inline-flex box: `normal` is always the token size; `small` is the letters plus
/// padding by the line height, or the width or height a stack stretches it to.
private struct NMarkFrame: Layout {
    let spec: NTextSpec
    let size: NMark.Size

    private func natural() -> CGSize {
        let layout = spec.state.layout ?? MainActor.assumeIsolated { spec.layout(width: nil) }
        spec.state.layout = layout
        if size == .normal {
            return CGSize(width: GMMarkTokens.width, height: GMMarkTokens.height)
        }
        return CGSize(width: layout.width + 2 * GMMarkTokens.smallPaddingX, height: spec.line.height)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = natural()
        if size == .normal {
            return natural
        }
        // A finite offer is a stack stretching the mark (CSS stretch); none keeps it natural.
        return CGSize(
            width: stretched(proposal.width, natural.width), height: stretched(proposal.height, natural.height))
    }

    private func stretched(_ offer: CGFloat?, _ natural: CGFloat) -> CGFloat {
        guard let offer, offer.isFinite else {
            return natural
        }
        return offer
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = natural()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
