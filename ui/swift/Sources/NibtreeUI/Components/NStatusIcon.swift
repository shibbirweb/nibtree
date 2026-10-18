import NibtreeTokens
import SwiftUI

/// A small mark for an agent's or task's state: the Swift side of ui/web `StatusIcon` (docs/components/StatusIcon.md).
/// A spinner while starting or working, an orange question mark when it needs you, a check when done, a square when it
/// exited, a ring when idle. `label` is its tooltip and what VoiceOver reads. One canvas draws every state; only the
/// spinning ones turn.
public struct NStatusIcon: View {
    public enum State: String, CaseIterable, Sendable {
        case starting, working, waiting, done, exited, idle
    }

    private let state: State
    private let label: String

    public init(state: State, label: String) {
        self.state = state
        self.label = label
    }

    public var body: some View {
        mark
            .modifier(NHoverHelp(text: label))
            .accessibilityElement()
            .accessibilityLabel(label)
    }

    /// A turning spinner, or a still state.
    @ViewBuilder private var mark: some View {
        if state == .working || state == .starting {
            NStatusIconSpin()
        } else {
            NStatusIconFace(state: state)
        }
    }
}

/// The still states in one canvas, centered in the mark's square like the web's `inline-flex`.
struct NStatusIconFace: View {
    let state: NStatusIcon.State

    nonisolated static let side = GMStatusIconTokens.size

    @MainActor private static let question: NTextSpec = {
        let font = NTypography.FontKey(GMTextStyles.body, size: GMFontSize.nano, weight: GMFontWeight.bold)
        return NTextSpec(
            text: "?", font: font, kerning: 0, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: 1), tone: .editorBg, strike: false)
    }()

    var body: some View {
        let state = state
        Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    Self.draw(state, palette: palette, scale: scale, in: cg)
                }
            }
        }
        .frame(width: Self.side, height: Self.side)
    }

    /// Draws a still state in a `side` square at the context's origin (a chip draws it in its own canvas too).
    @MainActor
    static func draw(_ state: NStatusIcon.State, palette: Palette, scale: CGFloat, in cg: CGContext) {
        switch state {
        case .waiting:
            let circle = GMStatusIconTokens.question
            let inset = (side - circle) / 2
            cg.setFillColor(palette.cgColor(.warning))
            cg.fillEllipse(in: CGRect(x: inset, y: inset, width: circle, height: circle))
            let layout = question.state.layout ?? question.layout(width: nil)
            question.state.layout = layout
            cg.translateBy(x: inset + (circle - layout.width) / 2, y: inset + (circle - question.line.height) / 2)
            NTextEngine.draw(
                layout, line: question.line, color: palette.cgColor(question.tone), strike: nil, scale: scale, in: cg)
        case .done:
            glyph(.check, size: .small, stroke: .bold, color: palette.cgColor(.success), scale: scale, in: cg)
        case .exited:
            glyph(.stop, size: .xxsmall, stroke: .normal, color: palette.cgColor(.textDim), scale: scale, in: cg)
        default:
            let ring = GMStatusIconTokens.ring
            let border = GMBorderWidth.mid
            let inset = (side - ring + border) / 2
            cg.setStrokeColor(palette.cgColor(.textDim))
            cg.setLineWidth(border)
            cg.strokeEllipse(in: CGRect(x: inset, y: inset, width: ring - border, height: ring - border))
        }
    }

    private static func glyph(
        _ name: GMIconName, size: NIconSize, stroke: NIconStroke, color: CGColor, scale: CGFloat, in cg: CGContext
    ) {
        let points = size.points
        let key = NIconImages.Key(name: name, points: points, lineWidth: stroke.width, scale: scale, color: color)
        guard let image = NIconImages.image(key, color: color) else {
            return
        }
        // A bitmap's y runs up, the canvas's down.
        let inset = (side - points) / 2
        cg.translateBy(x: inset, y: inset + points)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
    }
}

/// The spinner: an accent quarter on a faint accent ring, turning every 0.9 seconds; still in pictures.
struct NStatusIconSpin: View {
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    private static let turn = 0.9

    var body: some View {
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let accent = palette.cgColor(.accent)
                let size = GMStatusIconTokens.spinner
                context.withCGContext { cg in
                    cg.translateBy(x: (box.width - size) / 2, y: (box.height - size) / 2)
                    NSpinnerRing.draw(
                        size: size, in: cg, track: accent.copy(alpha: accent.alpha * 0.25) ?? accent, head: accent,
                        border: GMBorderWidth.thick)
                }
            }
        }
        .frame(width: NStatusIconFace.side, height: NStatusIconFace.side)
        .rotationEffect(.degrees(started && !still ? 360 : 0))
        .animation(.linear(duration: Self.turn).repeatForever(autoreverses: false), value: started)
        .onAppear { started = true }
    }
}
