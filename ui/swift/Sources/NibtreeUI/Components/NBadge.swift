import NibtreeTokens
import SwiftUI

/// A count in a small pill, like the changes count on the activity bar: the Swift side of ui/web `Badge`
/// (docs/components/Badge.md). Shows "99+" above `max`. `corner` takes no room and is pinned by its top right corner
/// to its own spot, like the web's absolute badge on a button: a button puts it there with
/// `.overlay(alignment: .topTrailing)`. In a column it is as wide as the stack, its count centered. The web's
/// `dotAt` and `hideAt` come with the responsive Stack and Toolbar.
public struct NBadge: View {
    public enum Tone: String, CaseIterable, Sendable {
        case accent, danger, warning, neutral, quiet

        var fill: GMColorToken {
            switch self {
            case .accent: .accent
            case .danger: .danger
            case .warning: .warning
            case .neutral: .hover
            case .quiet: .selectedInactive
            }
        }
    }

    public enum Size: String, CaseIterable, Sendable {
        case small, normal, large, corner
    }

    private let spec: NTextSpec
    private let tone: Tone
    private let size: Size
    private let label: String?

    /// `label` says what the count means for VoiceOver, such as "3 changes"; the number by default.
    public init(count: Int, max: Int = 99, tone: Tone = .accent, size: Size = .normal, label: String? = nil) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: NBadgeBox.fontSize(size),
            weight: size == .corner ? GMFontWeight.regular : GMFontWeight.semibold)
        let box = NBadgeBox(size: size)
        spec = NTextSpec(
            text: count > max ? "\(max)+" : "\(count)", font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: Double(box.height / font.size)),
            tone: tone == .neutral || tone == .quiet ? .textDim : .accentText, strike: false)
        self.tone = tone
        self.size = size
        self.label = label ?? "\(count)"
    }

    public var body: some View {
        NBadgeFrame(spec: spec, box: NBadgeBox(size: size)) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        // CSS shrinks a radius larger than half the box (the large badge's 9 on 17 points).
                        let radius = min(NBadgeBox(size: size).radius, box.width / 2, box.height / 2)
                        cg.addPath(CGPath(
                            roundedRect: CGRect(origin: .zero, size: box), cornerWidth: radius, cornerHeight: radius,
                            transform: nil))
                        cg.setFillColor(palette.cgColor(tone.fill))
                        cg.fillPath()
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // `text-align: center` puts the count at fractions of a point, as WebKit draws it.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + (box.width - layout.width) / 2,
                            y: origin.y - (origin.y * scale).rounded() / scale)
                        NTextEngine.draw(
                            layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                            in: cg)
                    }
                }
            }
        }
        .accessibilityLabel(label ?? "")
    }
}

/// Each size's height (also its line), smallest width, side padding, radius and count size.
struct NBadgeBox {
    let size: NBadge.Size

    var height: CGFloat {
        switch size {
        case .normal: GMBadgeTokens.size
        case .large: GMBadgeTokens.largeHeight
        case .small, .corner: GMBadgeTokens.smallSize
        }
    }

    var minWidth: CGFloat { size == .large ? GMBadgeTokens.largeMinWidth : height }

    var paddingX: CGFloat {
        switch size {
        case .small, .normal: GMBadgeTokens.paddingX
        case .large: GMBadgeTokens.largePaddingX
        case .corner: GMBadgeTokens.cornerPaddingX
        }
    }

    var radius: CGFloat {
        switch size {
        case .normal: GMBadgeTokens.radius
        case .large: GMBadgeTokens.largeRadius
        case .small, .corner: GMBadgeTokens.smallRadius
        }
    }

    static func fontSize(_ size: NBadge.Size) -> CGFloat {
        switch size {
        case .large: GMFontSize.xsmall
        case .corner: GMFontSize.micro
        case .small, .normal: GMFontSize.tiny
        }
    }
}

/// Sizes the pill like the web's border-box: the count plus padding, at least the smallest width, or the width a
/// column stretches it to; always its own height. A corner badge takes no room and sits up and right of its spot.
private struct NBadgeFrame: Layout {
    let spec: NTextSpec
    let box: NBadgeBox

    private func natural() -> CGSize {
        let layout = spec.state.layout ?? MainActor.assumeIsolated { spec.layout(width: nil) }
        spec.state.layout = layout
        return CGSize(width: max(box.minWidth, layout.width + 2 * box.paddingX), height: box.height)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = natural()
        if box.size == .corner {
            return .zero
        }
        // A finite offer is a column stretching the badge (CSS stretch); none keeps it natural.
        let width = proposal.width.flatMap { $0.isFinite ? Swift.max($0, box.minWidth) : nil } ?? natural.width
        return CGSize(width: width, height: natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let natural = natural()
        var frame = bounds
        if box.size == .corner {
            let offset = GMBadgeTokens.cornerOffset
            frame = CGRect(
                x: bounds.maxX + offset - natural.width, y: bounds.minY - offset, width: natural.width,
                height: natural.height)
        }
        spec.state.origin = frame.origin
        subviews.first?.place(at: frame.origin, anchor: .topLeading, proposal: ProposedViewSize(frame.size))
    }
}
