import SwiftUI

/// The flexbox subset `NStack` needs: a row or a column with a gap, children aligned on the cross axis (stretch fills
/// it) and spread on the main axis (start, center, end, or between with the free space shared out between them).
struct NStackLayout: Layout {
    var axis: Axis
    var spacing: CGFloat
    var align: NStackAlign
    var justify: NStackJustify

    private func main(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.width : size.height }
    private func cross(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.height : size.width }

    private func size(main: CGFloat, cross: CGFloat) -> CGSize {
        axis == .horizontal ? CGSize(width: main, height: cross) : CGSize(width: cross, height: main)
    }

    /// Children get the cross size on offer and are free on the main axis, like flex items.
    private func childProposal(_ proposal: ProposedViewSize) -> ProposedViewSize {
        axis == .horizontal
            ? ProposedViewSize(width: nil, height: proposal.height)
            : ProposedViewSize(width: proposal.width, height: nil)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(childProposal(proposal)) }
        let gaps = spacing * CGFloat(max(0, sizes.count - 1))
        let content = sizes.reduce(0) { $0 + main($1) } + gaps
        let offered = axis == .horizontal ? proposal.width : proposal.height
        // Spreading out or centering needs the whole offered length, like a flex container.
        let mainSize = justify == .start ? content : max(content, offered ?? content)
        let offeredCross = axis == .horizontal ? proposal.height : proposal.width
        let largest = sizes.map(cross).max() ?? 0
        let crossSize = align == .stretch ? max(largest, offeredCross ?? largest) : largest
        return size(main: mainSize, cross: crossSize)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let crossBounds = cross(bounds.size)
        let sizes = subviews.map { $0.sizeThatFits(childProposal(proposal)) }
        let used = sizes.reduce(0) { $0 + main($1) } + spacing * CGFloat(max(0, sizes.count - 1))
        let free = max(0, main(bounds.size) - used)
        var position: CGFloat
        var extra: CGFloat = 0
        switch justify {
        case .start: position = 0
        case .center: position = free / 2
        case .end: position = free
        case .between:
            position = 0
            extra = sizes.count > 1 ? free / CGFloat(sizes.count - 1) : 0
        }
        let origin = axis == .horizontal ? bounds.minX : bounds.minY
        let crossOrigin = axis == .horizontal ? bounds.minY : bounds.minX
        for (subview, childSize) in zip(subviews, sizes) {
            let childCross = align == .stretch ? crossBounds : min(cross(childSize), crossBounds)
            let crossOffset: CGFloat
            switch align {
            case .start, .stretch: crossOffset = 0
            case .center: crossOffset = (crossBounds - childCross) / 2
            case .end: crossOffset = crossBounds - childCross
            }
            let point = axis == .horizontal
                ? CGPoint(x: origin + position, y: crossOrigin + crossOffset)
                : CGPoint(x: crossOrigin + crossOffset, y: origin + position)
            let placed = ProposedViewSize(size(main: main(childSize), cross: childCross))
            subview.place(at: point, anchor: .topLeading, proposal: placed)
            position += main(childSize) + spacing + extra
        }
    }
}
