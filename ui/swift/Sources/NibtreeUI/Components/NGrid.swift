import NibtreeTokens
import SwiftUI

/// A grid's columns: a fixed count, or `auto` for as many as fit.
public enum NGridColumns: String, CaseIterable, Sendable {
    case auto, two, three, four, six

    /// The fixed count, or nil for as many as fit.
    var count: Int? {
        switch self {
        case .auto: nil
        case .two: 2
        case .three: 3
        case .four: 4
        case .six: 6
        }
    }
}

/// A grid of equal columns with a gap from the spacing steps: the Swift side of ui/web `Grid`
/// (docs/components/Grid.md). A fixed count, or as many columns as fit at `minColumn`. Each row is as tall as its
/// tallest child and every child fills its cell, as CSS grid stretches them; the grid always fills its stack's cross
/// axis (`align-self: stretch`).
public struct NGrid<Content: View>: View {
    private let columns: NGridColumns
    private let minColumn: NColumnWidth
    private let gap: NSpacing
    private let label: String?
    private let content: Content

    public init(
        columns: NGridColumns = .auto, minColumn: NColumnWidth = .medium, gap: NSpacing = .lg, label: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.columns = columns
        self.minColumn = minColumn
        self.gap = gap
        self.label = label
        self.content = content()
    }

    public var body: some View {
        NGridLayout(count: columns.count, minColumn: minColumn.points, gap: gap.points) { content }
            .layoutValue(key: NStackAlignSelf.self, value: .stretch)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label ?? "")
    }
}

/// CSS grid's equal columns: `repeat(n, minmax(0, 1fr))`, or `repeat(auto-fill, minmax(min, 1fr))`.
struct NGridLayout: Layout {
    let count: Int?
    let minColumn: CGFloat
    let gap: CGFloat

    /// How many columns a grid `width` wide has.
    static func columns(width: CGFloat, count: Int?, minColumn: CGFloat, gap: CGFloat) -> Int {
        if let count {
            return count
        }
        return max(1, Int(((width + gap) / (minColumn + gap)).rounded(.down)))
    }

    private func cells(_ subviews: Subviews, width: CGFloat?) -> (columns: Int, cell: CGFloat, rows: [CGFloat]) {
        let natural = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let width = width ?? {
            let n = CGFloat(count ?? 1)
            return n * max(natural, count == nil ? minColumn : 0) + (n - 1) * gap
        }()
        let columns = Self.columns(width: width, count: count, minColumn: minColumn, gap: gap)
        let cell = max(0, (width - CGFloat(columns - 1) * gap) / CGFloat(columns))
        var rows: [CGFloat] = []
        for (index, subview) in subviews.enumerated() {
            let height = subview.sizeThatFits(ProposedViewSize(width: cell, height: nil)).height
            if index % columns == 0 {
                rows.append(height)
            } else {
                rows[rows.count - 1] = max(rows[rows.count - 1], height)
            }
        }
        return (columns, cell, rows)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let (columns, cell, rows) = cells(subviews, width: width)
        let height = rows.reduce(0, +) + CGFloat(max(0, rows.count - 1)) * gap
        return CGSize(width: width ?? CGFloat(columns) * cell + CGFloat(columns - 1) * gap, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let (columns, cell, rows) = cells(subviews, width: bounds.width)
        var y = bounds.minY
        for (index, subview) in subviews.enumerated() {
            let (row, column) = (index / columns, index % columns)
            if column == 0, row > 0 {
                y += rows[row - 1] + gap
            }
            subview.place(
                at: CGPoint(x: bounds.minX + CGFloat(column) * (cell + gap), y: y), anchor: .topLeading,
                proposal: ProposedViewSize(width: cell, height: rows[row]))
        }
    }
}
