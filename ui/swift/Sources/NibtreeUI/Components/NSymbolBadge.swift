import NibtreeTokens
import SwiftUI

/// A one-letter badge for a code symbol's kind (C class, I interface, F function, K constant): the Swift side of
/// ui/web `SymbolBadge` (docs/components/SymbolBadge.md), in the syntax color of its group. A fixed square whatever
/// the stack around it; the letter is centered and may overflow both sides. The web's `title` is the caller's
/// `.help(...)`: a tooltip costs as much as the badge, so only titled badges pay.
public struct NSymbolBadge: View {
    public enum Tone: String, CaseIterable, Sendable {
        case type, interface, function, constant

        var color: GMColorToken {
            switch self {
            case .type: .tokType
            case .interface: .tokKeyword
            case .function: .tokFunction
            case .constant: .tokProperty
            }
        }
    }

    private let spec: NTextSpec
    private let tone: Tone

    public init(letter: String, tone: Tone) {
        let font = NTypography.FontKey(
            GMTextStyles.body, size: GMFontSize.micro, weight: GMFontWeight.bold, mono: true)
        spec = NTextSpec(
            text: letter, font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: nil), tone: .panel, strike: false)
        self.tone = tone
    }

    public var body: some View {
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                let radius = GMSymbolBadgeTokens.radius
                context.withCGContext { cg in
                    cg.setFillColor(palette.cgColor(tone.color))
                    cg.addPath(CGPath(
                        roundedRect: CGRect(origin: .zero, size: box), cornerWidth: radius, cornerHeight: radius,
                        transform: nil))
                    cg.fillPath()
                    // Laid out on the first drawing and kept: the letter never changes.
                    let layout = spec.state.layout ?? spec.layout(width: nil)
                    spec.state.layout = layout
                    cg.translateBy(x: (box.width - layout.width) / 2, y: (box.height - spec.line.height) / 2)
                    NTextEngine.draw(
                        layout, line: spec.line, color: palette.cgColor(spec.tone), strike: nil, scale: scale,
                        in: cg)
                }
            }
        }
        .frame(width: GMSymbolBadgeTokens.size, height: GMSymbolBadgeTokens.size)
        .accessibilityLabel(spec.text)
    }
}
