import NibtreeTokens
import SwiftUI

/// A status bar's look: `flat` under a line, or `rounded`, on the window frame's color.
public enum NStatusBarLook: String, CaseIterable, Sendable {
    case flat, rounded
}

/// The bottom status bar: items on the left (repository, branch) and on the right (memory, notifications): the Swift
/// side of ui/web `StatusBar` (docs/components/StatusBar.md). The left side clips when the window is narrow. Its items
/// (`NStatusItem`s) take the bar's dim color, as the web's inherit it; it always fills its stack's cross axis.
public struct NStatusBar<Start: View, End: View>: View {
    private let label: String
    private let look: NStatusBarLook
    private let start: Start
    private let end: End

    public init(
        label: String = "Status bar", look: NStatusBarLook = .flat, @ViewBuilder start: () -> Start,
        @ViewBuilder end: () -> End
    ) {
        self.label = label
        self.look = look
        self.start = start()
        self.end = end()
    }

    public var body: some View {
        let flat = look == .flat
        let side = NStackLayout(axis: .horizontal, spacing: 1, align: .center, justify: .start)
        NStatusBarLayout(flat: flat) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                let palette = context.environment.nibtreePalette
                let fill = palette.color(flat ? .panelAlt : .frame)
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(fill))
                if flat {
                    context.fill(
                        Path(CGRect(x: 0, y: 0, width: size.width, height: 1)),
                        with: .color(palette.color(.borderStrong)))
                }
            }
            NStatusBarClip { side { start } }.clipped()
            side { end }
        }
        .environment(\.nibtreeCurrentColor, .textDim)
        .layoutValue(key: NStackAlignSelf.self, value: .stretch)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}

/// The bar: the face under everything, the start side at the left padding (cut to the room the end side leaves), the
/// end side at the right, both centered below the line.
private struct NStatusBarLayout: Layout {
    let flat: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = subviews.dropFirst().reduce(0) { $0 + $1.sizeThatFits(.unspecified).width }
            + GMStatusBarTokens.gap + 2 * GMSpace.s3
        return CGSize(
            width: proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural, height: GMStatusBarTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 3 else {
            return
        }
        subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        let top: CGFloat = flat ? 1 : 0
        let middle = bounds.minY + top + (bounds.height - top) / 2
        let end = subviews[2].sizeThatFits(.unspecified)
        let start = subviews[1].sizeThatFits(.unspecified)
        // Both sides may shrink (`min-width: 0`) in proportion to their widths, as CSS flex-shrink shares the missing
        // room; the start side clips what it loses, the end side's items run on past its box.
        let available = bounds.width - 2 * GMSpace.s3 - GMStatusBarTokens.gap
        let widths = NCrumbMath.widths(
            basis: [start.width, end.width], least: [0, 0], shrink: [1, 1], available: available)
        subviews[1].place(
            at: CGPoint(x: bounds.minX + GMSpace.s3, y: middle), anchor: .leading,
            proposal: ProposedViewSize(width: widths[0], height: start.height))
        let fits = widths[1] >= end.width
        // Packed at the start when nothing is left over, spread to the ends (space-between) otherwise.
        let endLeft =
            fits
            ? bounds.maxX - GMSpace.s3 - end.width : bounds.minX + GMSpace.s3 + widths[0] + GMStatusBarTokens.gap
        subviews[2].place(
            at: CGPoint(x: endLeft, y: middle), anchor: .leading, proposal: ProposedViewSize(end))
    }
}

/// The start side's room: as wide as offered (the room the end side leaves), its items at their own width inside, so
/// a clip cuts what does not fit, like the web's `overflow: hidden`.
private struct NStatusBarClip: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = subviews.first?.sizeThatFits(.unspecified) ?? .zero
        return CGSize(width: min(proposal.width ?? natural.width, natural.width), height: natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let side = subviews.first else {
            return
        }
        let natural = side.sizeThatFits(.unspecified)
        side.place(at: CGPoint(x: bounds.minX, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(natural))
    }
}
