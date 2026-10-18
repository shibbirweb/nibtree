import NibtreeTokens
import SwiftUI

/// The bar's words and sizes, worked out once from the props as Breadcrumbs.svelte's classes do.
struct NBreadcrumbsLook: Sendable {
    let crumbs: [NCrumb]
    let names: [NTextSpec]
    let open: Int?
    /// Floating or anchored: a bordered box with a shadow, in small words.
    let boxed: Bool
    let placed = NBreadcrumbsPlaced()

    /// Breadcrumbs.svelte's nav `gap: 1px` and the box's `1px solid` border.
    nonisolated static let itemGap = 1.0
    nonisolated static let cssBorder = 1.0
    nonisolated static let separator = NIconSize.compact.points
    nonisolated static let lead = NIconSize.compact.points

    @MainActor
    init(crumbs: [NCrumb], open: Int?, boxed: Bool) {
        self.crumbs = crumbs
        self.open = open
        self.boxed = boxed
        let size = boxed ? GMFontSize.small : GMTextStyles.body.size
        names = crumbs.map { crumb in
            let font = NTypography.FontKey(
                GMTextStyles.body, size: size, weight: crumb.kind == .file ? GMFontWeight.semibold : nil)
            return NTextSpec(
                text: crumb.label, font: font, kerning: 0, tabular: false, truncate: true,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: Self.tone(crumb.kind), strike: false)
        }
    }

    static func tone(_ kind: NCrumb.Kind) -> GMColorToken {
        switch kind {
        case .repo: .accent
        case .folder: .textDim
        case .file: .text
        }
    }

    var padding: CGFloat { boxed ? GMBreadcrumbsTokens.floatingPaddingX + Self.cssBorder : 0 }
    var height: CGFloat { boxed ? GMBreadcrumbsTokens.floatingHeight : GMBreadcrumbsTokens.height }

    /// The room before a crumb's name: its padding and its icon.
    func nameLeft(_ index: Int) -> CGFloat {
        GMBreadcrumbsTokens.paddingX + (crumbs[index].lead == nil ? 0 : Self.lead + GMBreadcrumbsTokens.gap)
    }

    /// Each crumb's content width and least width (`1.4em`, and an icon's room), as CSS's flex basis and min-width.
    @MainActor
    func bases() -> (basis: [CGFloat], least: [CGFloat]) {
        var basis: [CGFloat] = []
        var least: [CGFloat] = []
        for (index, name) in names.enumerated() {
            let full = NTextEngine.layout(
                name.text, font: name.font, kerning: 0, tabular: false, truncate: false, width: nil)
            let em = 1.4 * name.font.size
            let floor = crumbs[index].lead == nil ? em : NIconSize.large.points + em
            basis.append(max(floor, nameLeft(index) + full.width + GMBreadcrumbsTokens.paddingX))
            least.append(floor)
        }
        return (basis, least)
    }

    /// The bar's items left to right, crumbs and separators: their widths in `room` points.
    @MainActor
    func widths(room: CGFloat?) -> [CGFloat] {
        let (basis, least) = bases()
        var items: [CGFloat] = []
        var inner: [CGFloat] = []
        var floors: [CGFloat] = []
        var shrinks: [CGFloat] = []
        for index in crumbs.indices {
            if index > 0 {
                items.append(Self.separator)
                inner.append(Self.separator)
                floors.append(Self.separator)
                shrinks.append(0)
            }
            items.append(basis[index])
            inner.append(basis[index] - 2 * GMBreadcrumbsTokens.paddingX)
            floors.append(least[index])
            // A crumb whose content is narrower than its least width is held at that width from the start.
            shrinks.append(basis[index] <= least[index] ? 0 : NCrumbMath.shrink(index: index, count: crumbs.count))
        }
        let gaps = Self.itemGap * CGFloat(max(0, items.count - 1))
        guard let room else {
            return items
        }
        return NCrumbMath.widths(basis: items, inner: inner, least: floors, shrink: shrinks, available: room - gaps)
    }
}

/// Where the layout put each item, for the canvas and for clicks.
final class NBreadcrumbsPlaced: @unchecked Sendable {
    /// Each crumb's left and width, from the bar's left.
    var crumbs: [(x: CGFloat, width: CGFloat)] = []
    var separators: [CGFloat] = []
    var origin = CGPoint.zero

    func crumb(at x: CGFloat) -> Int? {
        crumbs.firstIndex { x >= $0.x && x < $0.x + $0.width }
    }
}

/// The bar's room: as wide as its crumbs, or as wide as offered with the crumbs at its right end (flex-end), the
/// farthest crumbs shortening when it is narrow.
struct NBreadcrumbsFrame: Layout {
    let look: NBreadcrumbsLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.widths(room: nil) }
        let content = natural.reduce(0, +) + NBreadcrumbsLook.itemGap * CGFloat(max(0, natural.count - 1))
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? content + 2 * look.padding
        return CGSize(width: width, height: look.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let room = bounds.width - 2 * look.padding
        let widths = MainActor.assumeIsolated { look.widths(room: room) }
        let total = widths.reduce(0, +) + NBreadcrumbsLook.itemGap * CGFloat(max(0, widths.count - 1))
        var x = look.padding + room - total
        var crumbs: [(x: CGFloat, width: CGFloat)] = []
        var separators: [CGFloat] = []
        for (index, width) in widths.enumerated() {
            if index % 2 == 0 {
                crumbs.append((x, width))
            } else {
                separators.append(x)
            }
            x += width + NBreadcrumbsLook.itemGap
        }
        look.placed.crumbs = crumbs
        look.placed.separators = separators
        look.placed.origin = bounds.origin
        for subview in subviews {
            subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        }
    }
}
