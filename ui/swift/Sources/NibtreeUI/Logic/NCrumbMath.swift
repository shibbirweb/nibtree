import CoreGraphics

/// The Navigation Bar's widths, as logic/crumbs.ts and CSS flexbox work them out: crumbs keep their content's width
/// while it fits; when the bar is narrow, the farthest from the last crumb shorten first (their flex-shrink is 10 to
/// the power of that distance), none below its least width, and what still does not fit overflows to the left.
enum NCrumbMath {
    /// A crumb's flex-shrink.
    static func shrink(index: Int, count: Int) -> CGFloat {
        let distance = count - 1 - index
        return distance <= 0 ? 1 : pow(10, CGFloat(min(distance, 6)))
    }

    /// Each item's width in `available` points, CSS's flex-shrink with min widths: `basis` is each item's content
    /// width, `least` its min width and `shrink` its flex-shrink (0 keeps the item whole, like a separator). An item
    /// gives up width in proportion to its flex-shrink times its `inner` width (its basis less padding), as CSS says.
    static func widths(
        basis: [CGFloat], inner: [CGFloat]? = nil, least: [CGFloat], shrink: [CGFloat], available: CGFloat
    ) -> [CGFloat] {
        let inner = inner ?? basis
        var widths = basis
        guard basis.reduce(0, +) > available else {
            return widths
        }
        var frozen = shrink.map { $0 == 0 }
        while frozen.contains(false) {
            let fixed = widths.indices.filter { frozen[$0] }.reduce(0) { $0 + widths[$1] }
            let open = widths.indices.filter { !frozen[$0] }
            let free = available - fixed - open.reduce(0) { $0 + basis[$1] }
            if free >= 0 {
                open.forEach { widths[$0] = basis[$0] }
                break
            }
            let scaled = open.reduce(0) { $0 + shrink[$1] * inner[$1] }
            var violated = false
            for index in open {
                let share = scaled > 0 ? shrink[index] * inner[index] / scaled : 0
                widths[index] = basis[index] + free * share
                if widths[index] < least[index] {
                    widths[index] = least[index]
                    frozen[index] = true
                    violated = true
                }
            }
            if !violated {
                break
            }
        }
        return widths
    }
}
