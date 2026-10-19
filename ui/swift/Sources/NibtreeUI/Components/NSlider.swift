import NibtreeTokens
import SwiftUI

/// A range slider with its value on the right, like Settings' font size and line height: the Swift side of ui/web
/// `Slider` (docs/components/Slider.md). The web's is the browser's own range input, so the track and thumb are drawn
/// like WebKit's: the theme accent as WebKit adjusts it for contrast, a system gray track and a white thumb. The web's
/// `onchange` is the binding's own setter. With `resetValue`, a double-click puts that value back. VoiceOver reads it
/// as a slider named `label` and can adjust it.
public struct NSlider: View {
    public enum ValueWidth: String, CaseIterable, Sendable {
        case normal, wide
    }

    @Binding private var value: Double
    private let range: NSliderRange
    private let disabled: Bool
    private let valueWidth: ValueWidth
    private let label: String
    private let resetValue: Double?
    private let words: NTextSpec

    public init(
        value: Binding<Double>, min: Double, max: Double, step: Double = 1, label: String, disabled: Bool = false,
        valueWidth: ValueWidth = .normal, resetValue: Double? = nil,
        format: (Double) -> String = NSliderMath.text
    ) {
        _value = value
        range = NSliderRange(min: min, max: max, step: step)
        self.label = label
        self.disabled = disabled
        self.valueWidth = valueWidth
        self.resetValue = resetValue
        let font = NTypography.FontKey(GMTextStyles.body, size: NText.Size.small.points, mono: true)
        words = NTextSpec(
            text: format(value.wrappedValue), font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: GMTextStyles.body.lineHeight), tone: .text, strike: false)
    }

    public var body: some View {
        let width = valueWidth == .wide ? GMSliderTokens.wideValueWidth : GMSliderTokens.valueWidth
        NSliderFace(
            fraction: range.fraction(value), disabled: disabled, words: words, valueWidth: width)
            .frame(width: NSliderFace.valueLeft + width, height: NSliderFace.height)
            .gesture(DragGesture(minimumDistance: 0).onChanged(drag))
            .simultaneousGesture(TapGesture(count: 2).onEnded(reset))
            .accessibilityRepresentation {
                Slider(value: $value, in: range.min...Swift.max(range.min, range.max), step: range.step) {
                    Text(label)
                }
                .disabled(disabled)
            }
    }

    private func drag(_ gesture: DragGesture.Value) {
        if disabled {
            return
        }
        value = range.value(along: NSliderFace.along(gesture.location.x))
    }

    private func reset() {
        if disabled {
            return
        }
        if let resetValue {
            value = resetValue
        }
    }
}

struct NSliderRange: Sendable {
    let min: Double
    let max: Double
    let step: Double

    func fraction(_ value: Double) -> Double {
        NSliderMath.fraction(value, min: min, max: max, step: step)
    }

    func value(along: Double) -> Double {
        NSliderMath.value(along: along, min: min, max: max, step: step)
    }
}

/// The input and its value as WebKit lays them out: the input's 2-point margin, the 8-point track inset a point at
/// each end with a point of border, the 24 by 16 thumb, then the gap and the value right-aligned in its width.
private struct NSliderFace: View {
    let fraction: Double
    let disabled: Bool
    let words: NTextSpec
    let valueWidth: CGFloat

    /// The browser's margin around a range input.
    nonisolated static let margin = 2.0
    /// WebKit's range input is as tall as its thumb.
    nonisolated static let inputHeight = 16.0
    nonisolated static let height = inputHeight + 2 * margin
    nonisolated static let valueLeft = margin * 2 + GMSliderTokens.width + GMSliderTokens.gap
    private static let track = 8.0
    nonisolated private static let thumb = CGSize(width: 24, height: inputHeight)
    /// WebKit's `kDisabledControlAlpha`, on the track and fill (not the thumb).
    private static let disabledAlpha = 0.4
    private static let shadow = CGColor(gray: 0, alpha: 0.24)
    private static let shadowBlur = 2.0

    /// Where along the track a point is, 0 to 1, as the thumb's center travels.
    nonisolated static func along(_ x: CGFloat) -> Double {
        (x - margin - thumb.width / 2) / (GMSliderTokens.width - thumb.width)
    }

    var body: some View {
        let (fraction, disabled, words, valueWidth) = (fraction, disabled, words, valueWidth)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                // A disabled group (a fieldset) disables the slider too, as WebKit does.
                Self.draw(context, size, fraction: fraction, disabled: disabled || !context.environment.isEnabled)
                let layout = words.state.layout ?? words.layout(width: nil)
                words.state.layout = layout
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    cg.translateBy(
                        x: Self.valueLeft + valueWidth - layout.width,
                        y: ((size.height - words.line.height) / 2 * scale).rounded() / scale)
                    NTextEngine.draw(
                        layout, line: words.line, color: palette.cgColor(words.tone), strike: nil, scale: scale,
                        in: cg)
                }
            }
        }
    }

    private static func draw(_ context: GraphicsContext, _ size: CGSize, fraction: Double, disabled: Bool) {
        let palette = context.environment.nibtreePalette
        let colors = NWebKitColors.colors(dark: palette.isDark)
        let alpha = disabled ? disabledAlpha : 1
        let middle = size.height / 2
        let border = CGRect(x: margin, y: middle - track / 2 - 1, width: GMSliderTokens.width, height: track + 2)
        context.fill(Capsule().path(in: border), with: .color(colors.inside.opacity(alpha)))
        let bar = Capsule().path(in: border.insetBy(dx: 1, dy: 1))
        context.fill(bar, with: .color(colors.track.opacity(alpha)))
        let center = margin + thumb.width / 2 + fraction * (GMSliderTokens.width - thumb.width)
        var fill = context
        fill.clip(to: bar)
        let tint = NSliderMath.tint(palette.cgColor(.accent), dark: palette.isDark)
        fill.fill(
            Path(CGRect(x: margin, y: border.minY, width: center - margin, height: border.height)),
            with: .color(Color(cgColor: tint).opacity(alpha)))
        context.withCGContext { cg in
            cg.setShadow(offset: .zero, blur: shadowBlur, color: shadow)
            cg.setFillColor(gray: 1, alpha: 1)
            let knob = CGRect(x: center - thumb.width / 2, y: middle - thumb.height / 2, width: thumb.width,
                height: thumb.height)
            cg.addPath(CGPath(roundedRect: knob, cornerWidth: thumb.height / 2, cornerHeight: thumb.height / 2,
                transform: nil))
            cg.fillPath()
        }
    }
}
