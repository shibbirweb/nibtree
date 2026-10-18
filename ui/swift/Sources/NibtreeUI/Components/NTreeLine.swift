import NibtreeTokens
import SwiftUI

/// The connector in front of a row that belongs to a group, like split terminals in the terminal list: the Swift side
/// of ui/web `TreeLine` (docs/components/TreeLine.md). A vertical line from the group's first row to its last, with a
/// short tick to each row. It is as tall as the row it stands in, and the next item overlaps its tick a little (the
/// web's negative margin). A canvas is not read by VoiceOver, like the web's `aria-hidden` span.
public struct NTreeLine: View {
    public enum Position: String, CaseIterable, Sendable {
        case first, middle, last
    }

    private let position: Position

    public init(position: Position) {
        self.position = position
    }

    public var body: some View {
        NTreeLineFrame {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                MainActor.assumeIsolated {
                    let scale = max(1, context.environment.displayScale)
                    // WebKit puts the borders at 50% on whole device pixels.
                    let middle = (box.height / 2 * scale).rounded() / scale
                    let top = position == .first ? middle : 0
                    let bottom = position == .last ? middle : box.height
                    var path = Path(CGRect(x: 0, y: top, width: 1, height: max(0, bottom - top)))
                    path.addRect(CGRect(x: 0, y: middle, width: box.width, height: 1))
                    context.fill(path, with: .color(context.environment.nibtreePalette.color(.borderStrong)))
                }
            }
        }
        .layoutValue(key: NStackAlignSelf.self, value: .stretch)
    }
}

/// The line's room: its token width less the overlap the next item takes, and no height of its own (a row stretches
/// it); the canvas is the full token width.
private struct NTreeLineFrame: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let height = proposal.height.flatMap { $0.isFinite ? $0 : nil } ?? 0
        return CGSize(width: GMTreeLineTokens.width - GMTreeLineTokens.overlap, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(
            at: bounds.origin, anchor: .topLeading,
            proposal: ProposedViewSize(width: GMTreeLineTokens.width, height: bounds.height))
    }
}
