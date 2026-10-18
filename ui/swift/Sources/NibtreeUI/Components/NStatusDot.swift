import NibtreeTokens
import SwiftUI

/// A small round dot that tells a state at a glance: a command's result, a server being on, a run going on (it
/// pulses), or new activity. The Swift side of ui/web `StatusDot` (docs/components/StatusDot.md). `label` is read by
/// VoiceOver; the web also shows it as a tooltip, which in SwiftUI is the caller's `.help(label)`. The web's `pulse` is
/// the caller's `.nibtreePulse()` on a running dot, so the dots that stay still have no animation to pay for.
public struct NStatusDot: View {
    public enum Tone: String, CaseIterable, Sendable {
        case neutral, success, danger, warning, accent
    }

    public enum Size: String, CaseIterable, Sendable {
        case normal, small
    }

    private let tone: Tone
    private let size: Size
    private let label: String?

    public init(tone: Tone = .neutral, size: Size = .normal, label: String? = nil) {
        self.tone = tone
        self.size = size
        self.label = label
    }

    public var body: some View {
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
