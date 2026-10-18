import NibtreeTokens
import SwiftUI

/// A rounded word that tells a state: unsaved, modified, merging, read-only or "write" on a tool. The Swift side of
/// ui/web `Pill` (docs/components/Pill.md). Tones tint the background with the color, `strong` makes the word bold,
/// `border` adds a border in the word's color and `outline` is a small bordered flag (a setting's memory cost). Like
/// the web's block in a flex box it is as wide as a column that stretches it and as tall as a row that does. The
/// web's `title` is the caller's `.help(...)`; its `dotAt` comes with the responsive Stack and Toolbar.
public struct NPill: View {
    public enum Tone: String, CaseIterable, Sendable {
        case neutral, accent, success, warning, danger, selected

        var color: GMColorToken {
            switch self {
            case .neutral: .textDim
            case .accent: .accent
            case .success: .success
            case .warning: .warning
            case .danger: .danger
            case .selected: .text
            }
        }
    }

    public enum Variant: String, CaseIterable, Sendable {
        case fill, outline, border
    }

    private let spec: NTextSpec
    private let tone: Tone
    private let variant: Variant

    public init(_ text: String, tone: Tone = .neutral, strong: Bool = false, variant: Variant = .fill) {
        let outline = variant == .outline
        let weight = outline ? GMFontWeight.medium : strong ? GMFontWeight.semibold : GMFontWeight.regular
        let font = NTypography.FontKey(
            GMTextStyles.body, size: outline ? GMFontSize.mini : GMFontSize.xsmall, weight: weight)
        let tall = variant == .border || tone == .selected
        let line = tall ? GMPillTokens.tallLineHeight : GMPillTokens.lineHeight
        spec = NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: Double(line / font.size)), tone: tone.color, strike: false)
        self.tone = tone
        self.variant = variant
    }

    public var body: some View {
        NPillFrame(spec: spec, border: variant == .fill ? 0 : 1) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    let border: CGFloat = variant == .fill ? 0 : 1
                    context.withCGContext { cg in
                        let radius = min(
                            variant == .outline ? GMPillTokens.outlineRadius : GMPillTokens.radius, box.width / 2,
                            box.height / 2)
                        let outer = CGPath(
                            roundedRect: CGRect(origin: .zero, size: box), cornerWidth: radius, cornerHeight: radius,
                            transform: nil)
                        // The background runs under the border, which an outline's transparent one lets show.
                        if let fill = NPillFace.fill(tone, variant, palette) {
                            cg.setFillColor(fill)
                            cg.addPath(outer)
                            cg.fillPath()
                        }
                        if let line = NPillFace.border(tone, variant, palette) {
                            let inner = max(0, radius - 1)
                            cg.addPath(outer)
                            cg.addPath(CGPath(
                                roundedRect: CGRect(origin: .zero, size: box).insetBy(dx: 1, dy: 1),
                                cornerWidth: inner, cornerHeight: inner, transform: nil))
                            cg.setFillColor(line)
                            cg.fillPath(using: .evenOdd)
                        }
                        guard let layout = spec.state.layout else {
                            return
                        }
                        // The word sits at fractions of a point, as WebKit draws it; SwiftUI rounded the box's spot.
                        let origin = spec.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale + border + GMPillTokens.paddingX,
                            y: origin.y - (origin.y * scale).rounded() / scale + border)
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

/// Pill.svelte's background and border colors per tone and variant.
enum NPillFace {
    static func fill(_ tone: NPill.Tone, _ variant: NPill.Variant, _ palette: Palette) -> CGColor? {
        switch (variant, tone) {
        case (.border, _), (.outline, .neutral): return nil
        case (.outline, .warning): return tinted(.warning, 0.12, palette)
        case (_, .neutral): return palette.cgColor(.hover)
        case (_, .selected): return palette.cgColor(.selected)
        case (_, .warning): return tinted(.warning, 0.18, palette)
        default: return tinted(tone.color, 0.15, palette)
        }
    }

    static func border(_ tone: NPill.Tone, _ variant: NPill.Variant, _ palette: Palette) -> CGColor? {
        switch (variant, tone) {
        case (.fill, _): nil
        case (.border, _): palette.cgColor(tone.color)
        case (.outline, .warning): tinted(.warning, 0.45, palette)
        case (.outline, .neutral): palette.cgColor(.borderStrong)
        case (.outline, _): nil
        }
    }

    /// `color-mix(in srgb, color share, transparent)`.
    static func tinted(_ token: GMColorToken, _ share: Double, _ palette: Palette) -> CGColor {
        let color = palette.cgColor(token)
        return color.copy(alpha: color.alpha * share) ?? color
    }
}

/// Sizes the pill like the web's block: the word plus padding and border, or the width a column stretches it to;
/// its line plus border, or the height a row stretches it to.
private struct NPillFrame: Layout {
    let spec: NTextSpec
    let border: CGFloat

    private func natural() -> CGSize {
        let layout = spec.state.layout ?? MainActor.assumeIsolated { spec.layout(width: nil) }
        spec.state.layout = layout
        return CGSize(
            width: layout.width + 2 * (GMPillTokens.paddingX + border), height: spec.line.height + 2 * border)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = natural()
        // A finite offer is a stack stretching the pill (CSS stretch); none keeps it natural.
        return CGSize(
            width: proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural.width,
            height: proposal.height.flatMap { $0.isFinite ? $0 : nil } ?? natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        _ = natural()
        spec.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
