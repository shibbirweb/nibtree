import NibtreeTokens
import SwiftUI

/// One label and value pair of a description list.
public struct NDescriptionItem: Hashable, Sendable {
    public let label: String
    public let value: String
    public let mono: Bool

    public init(label: String, value: String, mono: Bool = false) {
        self.label = label
        self.value = value
        self.mono = mono
    }
}

/// Label and value pairs in two columns, like a commit's Author, Date and Parents: the Swift side of ui/web
/// `DescriptionList` (docs/components/DescriptionList.md). A value can be mono (hashes), or drawn by the `value`
/// builder (links, copy buttons); plain values can be selected. Like the web's `auto 1fr` grid, the labels' column is
/// as wide as the widest label and the values take the rest, a long value wrapping in it.
public struct NDescriptionList<Value: View>: View {
    private let items: [NDescriptionItem]
    private let label: String?
    private let value: (NDescriptionItem) -> Value

    public init(
        items: [NDescriptionItem], label: String? = nil, @ViewBuilder value: @escaping (NDescriptionItem) -> Value
    ) {
        self.items = items
        self.label = label
        self.value = value
    }

    public var body: some View {
        if Value.self == EmptyView.self {
            NDescriptionPlain(look: NDescriptionLook(items: items))
                .accessibilityElement(children: .contain)
                .accessibilityLabel(label ?? "")
        } else {
            built
        }
    }

    private var built: some View {
        NDescriptionLayout {
            ForEach(items, id: \.label) { item in
                NText(item.label, tone: .dim, size: .small)
                value(item)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label ?? "")
    }
}

extension NDescriptionList where Value == EmptyView {
    /// Each value as selectable small text, mono when the item says so.
    public init(items: [NDescriptionItem], label: String? = nil) {
        self.init(items: items, label: label) { _ in EmptyView() }
    }
}

/// CSS grid's `auto 1fr` with the token gaps: labels and values alternate in the subviews.
struct NDescriptionLayout: Layout {
    private struct Rows {
        var label: CGFloat = 0
        var heights: [CGFloat] = []
    }

    private func rows(_ subviews: Subviews, width: CGFloat?) -> Rows {
        var rows = Rows()
        let labels = stride(from: 0, to: subviews.count, by: 2).map { subviews[$0] }
        rows.label = labels.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let room = width.map { max(0, $0 - rows.label - GMDescriptionListTokens.columnGap) }
        for index in stride(from: 0, to: subviews.count, by: 2) {
            let label = subviews[index].sizeThatFits(.unspecified).height
            let value =
                index + 1 < subviews.count
                ? subviews[index + 1].sizeThatFits(ProposedViewSize(width: room, height: nil)).height : 0
            rows.heights.append(max(label, value))
        }
        return rows
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let rows = rows(subviews, width: width)
        let height =
            rows.heights.reduce(0, +) + CGFloat(max(0, rows.heights.count - 1)) * GMDescriptionListTokens.rowGap
        let values = stride(from: 1, to: subviews.count, by: 2).map { subviews[$0].sizeThatFits(.unspecified).width }
        let natural = rows.label + GMDescriptionListTokens.columnGap + (values.max() ?? 0)
        return CGSize(width: width ?? natural, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = rows(subviews, width: bounds.width)
        let left = bounds.minX + rows.label + GMDescriptionListTokens.columnGap
        let room = max(0, bounds.maxX - left)
        var y = bounds.minY
        for (row, height) in rows.heights.enumerated() {
            let index = row * 2
            subviews[index].place(
                at: CGPoint(x: bounds.minX, y: y), anchor: .topLeading,
                proposal: ProposedViewSize(width: rows.label, height: height))
            if index + 1 < subviews.count {
                subviews[index + 1].place(
                    at: CGPoint(x: left, y: y), anchor: .topLeading,
                    proposal: ProposedViewSize(width: room, height: height))
            }
            y += height + GMDescriptionListTokens.rowGap
        }
    }
}
