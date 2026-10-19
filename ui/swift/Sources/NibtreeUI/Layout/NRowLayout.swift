import NibtreeTokens
import SwiftUI

/// A row's flex line: the padding (and indent), the chevron's room, the content with the row's gap between items (an
/// `NSpacer` takes what is left), and the actions pushed to the end; all centered on the row or lined up on their
/// first baselines. The face sits under everything.
struct NRowLayout: Layout {
    let look: NRowLook

    private struct Line {
        var widths: [CGFloat] = []
        var heights: [CGFloat] = []
        var baselines: [CGFloat] = []
        var grows: [Bool] = []
        var actions: [Int] = []
        var content: [Int] = []
        var actionsWidth: CGFloat = 0
    }

    private func line(_ subviews: Subviews) -> Line {
        var line = Line()
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let base = subview.dimensions(in: .unspecified)[VerticalAlignment.firstTextBaseline]
            line.widths.append(size.width)
            line.heights.append(size.height)
            line.baselines.append(base)
            line.grows.append(subview[NStackGrows.self])
            switch subview[NRowPart.self] {
            case .actions: line.actions.append(index)
            case .content: line.content.append(index)
            case .face: break
            }
        }
        line.actionsWidth = line.actions.reduce(0) { $0 + line.widths[$1] }
            + CGFloat(max(0, line.actions.count - 1)) * GMRowTokens.actionsGap
        return line
    }

    /// The flex items: the chevron, each content view, the actions as one; the gaps between them.
    private func gaps(_ line: Line) -> CGFloat {
        let items = (look.expanded == nil ? 0 : 1) + line.content.count + (line.actions.isEmpty ? 0 : 1)
        return CGFloat(max(0, items - 1)) * look.gap
    }

    private func contentHeight(_ line: Line) -> CGFloat {
        let indices = line.content + line.actions
        let chevron = look.expanded == nil ? 0 : NIconSize.compact.points
        if look.align == .baseline {
            let above = indices.map { line.baselines[$0] }.max() ?? 0
            let below = indices.map { line.heights[$0] - line.baselines[$0] }.max() ?? 0
            return max(above + below, chevron)
        }
        return max(indices.map { line.heights[$0] }.max() ?? 0, chevron)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let line = line(subviews)
        let padding = look.padding
        let fixed = line.content.reduce(0) { $0 + line.widths[$1] } + line.actionsWidth + gaps(line)
            + (look.expanded == nil ? 0 : GMRowTokens.chevron)
        let natural = padding.left + fixed + padding.right
        return CGSize(
            width: proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? natural,
            height: look.height(content: contentHeight(line)))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let line = line(subviews)
        let padding = look.padding
        let boxTop = bounds.minY + padding.top
        let boxHeight = bounds.height - padding.top - padding.bottom
        let baseline = look.align == .baseline
        let above = (line.content + line.actions).map { line.baselines[$0] }.max() ?? 0
        let top = { (index: Int) -> CGFloat in
            baseline ? boxTop + above - line.baselines[index] : boxTop + (boxHeight - line.heights[index]) / 2
        }
        look.placed.origin = bounds.origin
        let chevron = NIconSize.compact.points
        look.placed.chevronTop = (baseline ? above - chevron : (boxHeight - chevron) / 2) + padding.top
        for subview in subviews where subview[NRowPart.self] == .face {
            subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        }
        var x = bounds.minX + padding.left + (look.expanded == nil ? 0 : GMRowTokens.chevron + look.gap)
        let used = line.content.reduce(0) { $0 + (line.grows[$1] ? 0 : line.widths[$1]) } + line.actionsWidth
            + gaps(line) + (look.expanded == nil ? 0 : GMRowTokens.chevron)
        let growing = line.content.filter { line.grows[$0] }.count
        let share = growing > 0 ? max(0, bounds.width - padding.left - padding.right - used) / CGFloat(growing) : 0
        for index in line.content {
            let width = line.grows[index] ? share : line.widths[index]
            subviews[index].place(
                at: CGPoint(x: x, y: top(index)), anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: line.heights[index]))
            x += width + look.gap
        }
        // `margin-left: auto`: the actions sit at the end, `--row-actions-gap` apart.
        var end = bounds.maxX - padding.right - line.actionsWidth
        for index in line.actions {
            subviews[index].place(
                at: CGPoint(x: end, y: top(index)), anchor: .topLeading,
                proposal: ProposedViewSize(width: line.widths[index], height: line.heights[index]))
            end += line.widths[index] + GMRowTokens.actionsGap
        }
    }
}
