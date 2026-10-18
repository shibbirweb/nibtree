import NibtreeTokens
import SwiftUI

/// How much of something is used: the Swift side of ui/web `Meter` (docs/components/Meter.md). A label and its value
/// on one line, a bar under them and an optional detail line. `memory` is a thin bar on a quiet track, `usage` a
/// taller one whose value takes the tone, and `mini` a short bar alone for a status bar item. Like the web's block it
/// is as wide as a column, or as its texts in a row; the detail wraps. The web's `title` is the caller's `.help(...)`.
/// Label and value are expected to fit side by side (the web would wrap them, which no use of it needs).
public struct NMeter: View {
    public enum Variant: String, CaseIterable, Sendable {
        case memory, usage, mini

        /// The app never draws an empty bar: a sliver shows the meter is there.
        var minimumShare: Double {
            switch self {
            case .memory: 0
            case .usage: 0.02
            case .mini: 0.04
            }
        }
    }

    public enum Tone: String, CaseIterable, Sendable {
        case accent, warning, danger

        var color: GMColorToken {
            switch self {
            case .accent: .accent
            case .warning: .warning
            case .danger: .danger
            }
        }
    }

    let parts: NMeterParts
    private let fraction: Double
    private let name: String

    /// `fraction` is 0 to 1, clamped like the web's bar width (NaN fills it, as an invalid CSS width does).
    public init(
        fraction: Double, label: String = "", value: String = "", detail: String = "", variant: Variant = .memory,
        tone: Tone = .accent
    ) {
        parts = NMeterParts(label: label, value: value, detail: detail, variant: variant, tone: tone,
            share: Self.shown(fraction, variant: variant))
        self.fraction = fraction
        name = label.isEmpty ? value : label
    }

    static func shown(_ fraction: Double, variant: Variant) -> Double {
        fraction.isNaN ? 1 : max(variant.minimumShare, min(1, max(0, fraction)))
    }

    public var body: some View {
        NMeterFrame(parts: parts) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        // The texts sit at fractions of a point, as WebKit draws them; SwiftUI rounded this spot.
                        let origin = parts.state.origin
                        cg.translateBy(
                            x: origin.x - (origin.x * scale).rounded() / scale,
                            y: origin.y - (origin.y * scale).rounded() / scale)
                        parts.draw(width: parts.state.width, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(name)
        .accessibilityValue("\(Int((fraction.isFinite ? fraction : 0) * 100))%")
    }
}

/// Where the meter's layout put it, and its detail laid out for the last width.
final class NMeterState: @unchecked Sendable {
    var origin = CGPoint.zero
    /// The width the layout gave: the canvas's own is rounded to device pixels and could wrap the detail sooner.
    var width: CGFloat = 0
    var detail: (width: CGFloat, layout: NTextEngine.Layout)?
}

/// The meter's texts, bar and the sizes between them.
struct NMeterParts {
    let label, value, detail: NTextSpec?
    let variant: NMeter.Variant
    let tone: NMeter.Tone
    let share: Double
    let state = NMeterState()

    @MainActor
    init(label: String, value: String, detail: String, variant: NMeter.Variant, tone: NMeter.Tone, share: Double) {
        let small = GMFontSize.small
        let row = variant != .mini && !(label.isEmpty && value.isEmpty)
        self.label = row && !label.isEmpty ? Self.spec(label, NTypography.FontKey(GMTextStyles.body, size: small)) : nil
        let valueFont = variant == .usage
            ? NTypography.FontKey(GMTextStyles.body, size: small, weight: GMFontWeight.bold)
            : NTypography.FontKey(GMTextStyles.body, size: small, mono: true)
        let valueTone: GMColorToken = variant == .usage && tone != .accent ? tone.color : .text
        self.value = row && !value.isEmpty ? Self.spec(value, valueFont, tone: valueTone) : nil
        self.detail = detail.isEmpty
            ? nil : Self.spec(detail, NTypography.FontKey(GMTextStyles.body, size: GMFontSize.xsmall), tone: .textDim)
        self.variant = variant
        self.tone = tone
        self.share = share
    }

    @MainActor
    private static func spec(_ text: String, _ font: NTypography.FontKey, tone: GMColorToken = .text) -> NTextSpec {
        NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
    }

    var barHeight: CGFloat { variant == .usage ? GMMeterTokens.usageHeight : GMProgressTokens.height }

    var barRadius: CGFloat { variant == .usage ? GMMeterTokens.usageRadius : GMProgressTokens.radius }

    /// The row's height: the taller of its texts' line boxes (an empty one has none).
    var rowHeight: CGFloat { max(label?.line.height ?? 0, value?.line.height ?? 0) }

    var barTop: CGFloat { variant == .mini ? 0 : rowHeight + GMMeterTokens.gap }

    @MainActor
    func oneLine(_ spec: NTextSpec?) -> NTextEngine.Layout? {
        guard let spec else {
            return nil
        }
        let layout = spec.state.layout ?? spec.layout(width: nil)
        spec.state.layout = layout
        return layout
    }

    @MainActor
    func detailLayout(width: CGFloat) -> NTextEngine.Layout? {
        guard let detail else {
            return nil
        }
        if let made = state.detail, made.width == width {
            return made.layout
        }
        let layout = detail.layout(width: width)
        state.detail = (width, layout)
        return layout
    }

    /// The width with nothing on offer: a mini's own, or its texts' widest line (CSS max-content).
    @MainActor
    var naturalWidth: CGFloat {
        if variant == .mini {
            return GMMeterTokens.miniWidth
        }
        let row = (oneLine(label)?.width ?? 0) + (oneLine(value)?.width ?? 0)
        return max(row, oneLine(detail)?.width ?? 0)
    }

    @MainActor
    func height(width: CGFloat) -> CGFloat {
        let lines = detailLayout(width: width).map { CGFloat($0.lines.count) * (detail?.line.height ?? 0) }
        return barTop + barHeight + (lines.map { GMSpace.s1 + $0 } ?? 0)
    }

    @MainActor
    func draw(width: CGFloat, palette: Palette, scale: CGFloat, in cg: CGContext) {
        let track: GMColorToken = variant == .memory ? .hover : .border
        let bar = CGRect(x: 0, y: barTop, width: width, height: barHeight)
        let path = CGPath(roundedRect: bar, cornerWidth: barRadius, cornerHeight: barRadius, transform: nil)
        cg.saveGState()
        cg.addPath(path)
        cg.setFillColor(palette.cgColor(track))
        cg.fillPath()
        cg.addPath(path)
        cg.clip()
        // The fill inherits the bar's radius; CSS shrinks both alike when it is narrower than its corners.
        let fill = CGRect(x: 0, y: barTop, width: width * share, height: barHeight)
        let corner = min(barRadius, fill.width / 2, fill.height / 2)
        cg.addPath(CGPath(roundedRect: fill, cornerWidth: corner, cornerHeight: corner, transform: nil))
        cg.setFillColor(palette.cgColor(tone.color))
        cg.fillPath()
        cg.restoreGState()
        if let label, let layout = oneLine(label) {
            text(layout, label, at: .zero, palette, scale, cg)
        }
        if let value, let layout = oneLine(value) {
            // `justify-content: space-between` puts the value at the end.
            text(layout, value, at: CGPoint(x: width - layout.width, y: 0), palette, scale, cg)
        }
        if let detail, let layout = detailLayout(width: width) {
            text(layout, detail, at: CGPoint(x: 0, y: barTop + barHeight + GMSpace.s1), palette, scale, cg)
        }
    }

    @MainActor
    private func text(
        _ layout: NTextEngine.Layout, _ spec: NTextSpec, at point: CGPoint, _ palette: Palette, _ scale: CGFloat,
        _ cg: CGContext
    ) {
        cg.saveGState()
        cg.translateBy(x: point.x, y: point.y)
        NTextEngine.draw(layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale, in: cg)
        cg.restoreGState()
    }
}

/// Sizes the meter like the web's block: the width on offer (a column) or its natural one (a row), a mini always its
/// own; as tall as its parts, or the height a row stretches it to.
private struct NMeterFrame: Layout {
    let parts: NMeterParts

    @MainActor
    private func width(_ offer: CGFloat?) -> CGFloat {
        guard parts.variant != .mini, let offer, offer.isFinite else {
            return parts.naturalWidth
        }
        return offer
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        MainActor.assumeIsolated {
            let width = width(proposal.width)
            let height = parts.height(width: width)
            guard let offer = proposal.height, offer.isFinite else {
                return CGSize(width: width, height: height)
            }
            return CGSize(width: width, height: max(offer, height))
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        parts.state.origin = bounds.origin
        parts.state.width = bounds.width
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
