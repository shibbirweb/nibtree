import SwiftUI

/// The flexbox subset `NStack` needs: a row or a column with a gap, children aligned on the cross axis (stretch fills
/// it) and spread on the main axis (start, center, end, or between with the free space shared out between them). It
/// also does the stack's padding (insets), like a CSS box, so a stack costs one SwiftUI view instead of several.
/// Children marked `NStackGrows` share the free main-axis length; a growing stack (`fills`) takes the length it is
/// offered, so it fills what its parent hands it.
struct NStackLayout: Layout {
    var axis: Axis
    var spacing: CGFloat
    var align: NStackAlign
    var justify: NStackJustify
    var insets = EdgeInsets()
    var fills = false

    private func main(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.width : size.height }
    private func cross(_ size: CGSize) -> CGFloat { axis == .horizontal ? size.height : size.width }

    private func size(main: CGFloat, cross: CGFloat) -> CGSize {
        axis == .horizontal ? CGSize(width: main, height: cross) : CGSize(width: cross, height: main)
    }

    private var horizontalInsets: CGFloat { insets.leading + insets.trailing }
    private var verticalInsets: CGFloat { insets.top + insets.bottom }

    /// The offer minus the padding.
    private func inner(_ proposal: ProposedViewSize) -> ProposedViewSize {
        ProposedViewSize(
            width: proposal.width.map { max(0, $0 - horizontalInsets) },
            height: proposal.height.map { max(0, $0 - verticalInsets) })
    }

    /// Children get the cross size on offer and are free on the main axis, like flex items.
    private func childProposal(_ inner: ProposedViewSize) -> ProposedViewSize {
        axis == .horizontal
            ? ProposedViewSize(width: nil, height: inner.height)
            : ProposedViewSize(width: inner.width, height: nil)
    }

    /// A child's size: SwiftUI's, with the exact width (`NExactWidth`) in place of a rounded-up one on a row.
    private func measure(_ subview: LayoutSubview, _ offer: ProposedViewSize) -> CGSize {
        let size = subview.sizeThatFits(offer)
        guard axis == .horizontal, let exact = subview[NExactWidth.self], exact <= size.width else {
            return size
        }
        return CGSize(width: exact, height: size.height)
    }

    /// The children's sizes for the last offer: SwiftUI asks for the size, then places, often with the same offer.
    struct Cache {
        var offer: ProposedViewSize?
        var sizes: [CGSize] = []
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    func updateCache(_ cache: inout Cache, subviews: Subviews) {
        cache = Cache()
    }

    private func sizes(_ inner: ProposedViewSize, _ subviews: Subviews, _ cache: inout Cache) -> [CGSize] {
        let offer = childProposal(inner)
        if cache.offer == offer, cache.sizes.count == subviews.count {
            return cache.sizes
        }
        let sizes = subviews.map { measure($0, offer) }
        cache = Cache(offer: offer, sizes: sizes)
        return sizes
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let inner = inner(proposal)
        let sizes = sizes(inner, subviews, &cache)
        let gaps = spacing * CGFloat(max(0, sizes.count - 1))
        let content = sizes.reduce(0) { $0 + main($1) } + gaps
        let offered = axis == .horizontal ? inner.width : inner.height
        // Spreading out or centering needs the whole offered length, like a flex container.
        let spreads = justify != .start || subviews.contains { $0[NStackGrows.self] }
        let mainSize = spreads ? max(content, offered ?? content) : content
        let offeredCross = axis == .horizontal ? inner.height : inner.width
        let largest = sizes.map(cross).max() ?? 0
        let crossSize = align == .stretch ? max(largest, offeredCross ?? largest) : largest
        let content2D = size(main: mainSize, cross: crossSize)
        let natural = CGSize(width: content2D.width + horizontalInsets, height: content2D.height + verticalInsets)
        guard fills else {
            return natural
        }
        return CGSize(
            width: max(natural.width, proposal.width ?? natural.width),
            height: max(natural.height, proposal.height ?? natural.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let box = CGRect(
            x: bounds.minX + insets.leading, y: bounds.minY + insets.top,
            width: max(0, bounds.width - horizontalInsets), height: max(0, bounds.height - verticalInsets))
        let crossBounds = cross(box.size)
        let grows = subviews.map { $0[NStackGrows.self] }
        var sizes = sizes(inner(proposal), subviews, &cache)
        let gaps = spacing * CGFloat(max(0, sizes.count - 1))
        let growing = grows.filter { $0 }.count
        if growing > 0 {
            // flex: 1 1 0: growing children start from nothing and share what the others leave.
            let fixed = zip(sizes, grows).reduce(0) { $0 + ($1.1 ? 0 : main($1.0)) }
            let share = max(0, main(box.size) - fixed - gaps) / CGFloat(growing)
            sizes = zip(sizes, grows).map { $0.1 ? size(main: share, cross: cross($0.0)) : $0.0 }
        }
        let used = sizes.reduce(0) { $0 + main($1) } + gaps
        let free = max(0, main(box.size) - used)
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
        let origin = axis == .horizontal ? box.minX : box.minY
        let crossOrigin = axis == .horizontal ? box.minY : box.minX
        for (subview, childSize) in zip(subviews, sizes) {
            let childCross = align == .stretch ? crossBounds : min(cross(childSize), crossBounds)
            let crossOffset: CGFloat
            switch align {
            case .start, .stretch: crossOffset = 0
            case .center: crossOffset = (crossBounds - childCross) / 2
            case .end: crossOffset = crossBounds - childCross
            }
            // Exact, fractions kept: text draws with Core Text at the same fractional spot as WebKit.
            let along = origin + position
            let point = axis == .horizontal
                ? CGPoint(x: along, y: crossOrigin + crossOffset)
                : CGPoint(x: crossOrigin + crossOffset, y: along)
            let placed = ProposedViewSize(size(main: main(childSize), cross: childCross))
            subview.place(at: point, anchor: .topLeading, proposal: placed)
            position += main(childSize) + spacing + extra
        }
    }
}
