import NibtreeTokens
import SwiftUI

/// A thin bar for a share of a whole, like each process's memory in the status bar details: the Swift side of ui/web
/// `ProgressBar` (docs/components/ProgressBar.md). Like the web's empty block it is as wide as the room a stack
/// stretches it to, and has no width of its own in a row.
public struct NProgressBar: View {
    public enum Tone: String, CaseIterable, Sendable {
        case accent, danger, warning, success

        var color: GMColorToken {
            switch self {
            case .accent: .accent
            case .danger: .danger
            case .warning: .warning
            case .success: .success
            }
        }
    }

    /// Tiny shares still show a sliver, like the memory details.
    static let minimumShare = 0.02

    private let share: Double
    private let label: String
    private let tone: Tone

    /// `value` is the share, 0 to 1; out-of-range and NaN values are clamped.
    public init(value: Double, label: String, tone: Tone = .accent) {
        share = Self.shown(value)
        self.label = label
        self.tone = tone
    }

    static func shown(_ value: Double) -> Double {
        min(1, max(minimumShare, value.isFinite ? value : 0))
    }

    public var body: some View {
        NProgressFrame {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let radius = GMProgressTokens.radius
                    context.withCGContext { cg in
                        let bar = CGPath(
                            roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius,
                            transform: nil)
                        cg.addPath(bar)
                        cg.setFillColor(palette.cgColor(.hover))
                        cg.fillPath()
                        // The fill is rounded too, inside the bar's own rounded clip (`overflow: hidden`).
                        cg.addPath(bar)
                        cg.clip()
                        // CSS shrinks both radii alike when the fill is narrower than its corners.
                        let fill = CGRect(x: 0, y: 0, width: size.width * share, height: size.height)
                        let corner = min(radius, fill.width / 2, fill.height / 2)
                        cg.addPath(CGPath(roundedRect: fill, cornerWidth: corner, cornerHeight: corner, transform: nil))
                        cg.setFillColor(palette.cgColor(tone.color))
                        cg.fillPath()
                    }
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((share * 100).rounded()))%")
    }
}

/// The token height, and the width a stack stretches it to (none otherwise, like an empty CSS block in a row).
private struct NProgressFrame: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 0
        return CGSize(width: width, height: GMProgressTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
