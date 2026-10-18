import NibtreeTokens
import SwiftUI

/// A small round dot that tells a state at a glance: a command's result, a server being on, a run going on (it
/// pulses), or new activity. The Swift side of ui/web `StatusDot` (docs/components/StatusDot.md). `label` is read by
/// VoiceOver; the web also shows it as a tooltip, which in SwiftUI is the caller's `.help(label)`.
public struct NStatusDot: View {
    public enum Tone: String, CaseIterable, Sendable {
        case neutral, success, danger, warning, accent
    }

    public enum Size: String, CaseIterable, Sendable {
        case normal, small
    }

    private let tone: Tone
    private let pulse: Bool
    private let size: Size
    private let label: String?

    public init(tone: Tone = .neutral, pulse: Bool = false, size: Size = .normal, label: String? = nil) {
        self.tone = tone
        self.pulse = pulse
        self.size = size
        self.label = label
    }

    public var body: some View {
        if pulse {
            dot.modifier(NPulse())
        } else {
            dot
        }
    }

    private var dot: some View {
        let points = size == .small ? GMStatusDotTokens.smallSize : GMStatusDotTokens.size
        return Canvas(opaque: false, rendersAsynchronously: false) { context, box in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                context.withCGContext { cg in
                    cg.setFillColor(color(palette))
                    cg.fillEllipse(in: CGRect(origin: .zero, size: box))
                }
            }
        }
        .frame(width: points, height: points)
        .accessibilityHidden(label == nil)
        .accessibilityLabel(label ?? "")
    }

    private func color(_ palette: Palette) -> CGColor {
        switch tone {
        case .neutral where size == .small:
            // color-mix(in srgb, var(--text-dim) 40%, transparent)
            let dim = palette.cgColor(.textDim)
            return dim.copy(alpha: dim.alpha * 0.4) ?? dim
        case .neutral: return palette.cgColor(.textFaint)
        case .success: return palette.cgColor(.success)
        case .danger: return palette.cgColor(.danger)
        case .warning: return palette.cgColor(.warning)
        case .accent: return palette.cgColor(.accent)
        }
    }
}

/// StatusDot.svelte's `pulse`: down to 0.3 and back each second, eased both ways; at rest when still.
private struct NPulse: ViewModifier {
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    func body(content: Content) -> some View {
        content
            .opacity(started && !still ? 0.3 : 1)
            .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: started)
            .onAppear { started = true }
    }
}
