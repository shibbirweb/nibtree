import NibtreeTokens
import SwiftUI

/// A small spinning ring for work in progress: the Swift side of ui/web `Spinner` (docs/components/Spinner.md).
/// `label` is read by VoiceOver; `delayed` fades it in after a moment, so quick work does not flash a spinner.
public struct NSpinner: View {
    public enum Size: String, CaseIterable, Sendable {
        case small, normal, large

        var points: CGFloat {
            switch self {
            case .small: GMSpinnerTokens.sizeSmall
            case .normal: GMSpinnerTokens.size
            case .large: GMSpinnerTokens.sizeLarge
            }
        }
    }

    /// One turn, as in Spinner.svelte's `spin` keyframes.
    static let turn = 0.8
    /// CSS's `ease`.
    static let ease = Animation.timingCurve(0.25, 0.1, 0.25, 1, duration: GMMotion.appear)

    private let label: String
    private let size: Size
    private let delayed: Bool
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    public init(label: String = "Loading", size: Size = .normal, delayed: Bool = false) {
        self.label = label
        self.size = size
        self.delayed = delayed
    }

    public var body: some View {
        // The ring is drawn once; turning and fading only change its layer's transform and opacity.
        Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                context.withCGContext { cg in
                    NSpinnerRing.draw(
                        size: box.width, in: cg, track: palette.cgColor(.borderStrong), head: palette.cgColor(.accent))
                }
            }
        }
        .frame(width: size.points, height: size.points)
        .rotationEffect(.degrees(started && !still ? 360 : 0))
        .animation(.linear(duration: Self.turn).repeatForever(autoreverses: false), value: started)
        .opacity(!delayed || started || still ? 1 : 0)
        .animation(Self.ease.delay(GMMotion.appearDelay), value: started)
        .onAppear { started = true }
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// CSS's round box with a border: the track color all round but the top quarter, between the corners' 45 degree
/// joins, in the accent color.
enum NSpinnerRing {
    static func draw(size: CGFloat, in cg: CGContext, track: CGColor, head: CGColor) {
        let center = CGPoint(x: size / 2, y: size / 2)
        let middle = (size - GMSpinnerTokens.border) / 2
        cg.setLineWidth(GMSpinnerTokens.border)
        // y grows downward, so the top is at -90 degrees.
        let (start, end) = (-CGFloat.pi * 3 / 4, -CGFloat.pi / 4)
        cg.setStrokeColor(track)
        cg.addArc(center: center, radius: middle, startAngle: end, endAngle: start + 2 * .pi, clockwise: false)
        cg.strokePath()
        cg.setStrokeColor(head)
        cg.addArc(center: center, radius: middle, startAngle: start, endAngle: end, clockwise: false)
        cg.strokePath()
    }
}
