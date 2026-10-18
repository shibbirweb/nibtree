import SwiftUI

/// What a split's layout measured last, for the handles' drags (a reference, so writing it does not redraw).
final class NSplitMeasure: @unchecked Sendable {
    var width: Double = 0
    var height: Double = 0
}

/// Places one handle at `ratio` of its box's width (less `gutter`), the box's full height: what `NSplitHandle` stands
/// in, without a GeometryReader (which rebuilds its content on every layout and costs many times this).
struct NRatioPlacement: Layout {
    var ratio: Double
    var gutter: Double
    var measure: NSplitMeasure

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let shared = max(0, bounds.width - gutter)
        measure.width = shared
        subviews.first?.place(
            at: CGPoint(x: bounds.minX + shared * ratio, y: bounds.midY), anchor: .center,
            proposal: ProposedViewSize(width: nil, height: bounds.height))
    }
}

/// Two panes and the handle between them, along one axis: the sized pane at `size` points, the other taking the rest,
/// the handle's one point between them, and the second pane's first point left for its line (drawn by the split's
/// canvas, like the web's border inside its box). Subviews: first, handle, second; first and second (the handle not
/// made yet, its point still kept); or first alone.
struct NSplitLayout: Layout {
    var row: Bool
    var size: Double
    var sizedFirst: Bool
    /// Told the split's length along its axis when it changes (SplitPane's `extent`), after the layout pass.
    var onLength: (@MainActor @Sendable (Double) -> Void)?
    var measure: NSplitMeasure?

    /// A layout must not change state while it runs, so the new length goes out once the pass is over.
    private func report(_ length: Double) {
        guard let onLength, let measure, measure.width != length else {
            return
        }
        measure.width = length
        Task { @MainActor in onLength(length) }
    }

    /// The first pane's length, out of `length` along the axis.
    static func firstLength(_ length: CGFloat, size: Double, sizedFirst: Bool) -> CGFloat {
        let sized = min(max(0, size), max(0, length - 1))
        return sizedFirst ? sized : max(0, length - 1 - sized)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        report(row ? bounds.width : bounds.height)
        guard subviews.count > 1 else {
            subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            return
        }
        let length = row ? bounds.width : bounds.height
        let first = Self.firstLength(length, size: size, sizedFirst: sizedFirst)
        // first, the handle's point, then the second pane after its line.
        let second = (start: first + 2, length: max(0, length - first - 2))
        let spans: [(start: CGFloat, length: CGFloat)] =
            subviews.count == 3 ? [(0, first), (first, 1), second] : [(0, first), second]
        for (subview, span) in zip(subviews, spans) {
            let point = row
                ? CGPoint(x: bounds.minX + span.start, y: bounds.minY)
                : CGPoint(x: bounds.minX, y: bounds.minY + span.start)
            let size = row
                ? CGSize(width: span.length, height: bounds.height)
                : CGSize(width: bounds.width, height: span.length)
            subview.place(at: point, anchor: .topLeading, proposal: ProposedViewSize(size))
        }
    }
}
