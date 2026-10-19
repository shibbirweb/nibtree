import NibtreeTokens
import SwiftUI

/// Which side of its panel an activity bar is on: its line is on the other side.
public enum NActivityBarSide: String, CaseIterable, Sendable {
    case left, right
}

/// One entry of an `NActivityBar`: a panel's button, the room that sends the rest to the bottom (the web's `null`), or
/// a short line.
public enum NActivityEntry: Sendable {
    case item(NActivityItem)
    case spacer
    case divider
}

/// A panel's button: its icon and name, an optional count badge or accent dot. `smallIcon` draws a glyph that looks
/// big at the bar's size (play) a step smaller; `active` shows it on whatever the bar's `active` says (a toggle that
/// is on by itself); `title` is the tooltip (the name by default).
public struct NActivityItem: Sendable {
    public let id: String
    public let icon: GMIconName
    public let label: String
    public let badge: Int?
    public let dot: Bool
    public let smallIcon: Bool
    public let active: Bool?
    public let title: String?
    public let badgeTone: NBadge.Tone

    public init(
        id: String, icon: GMIconName, label: String, badge: Int? = nil, dot: Bool = false, smallIcon: Bool = false,
        active: Bool? = nil, title: String? = nil, badgeTone: NBadge.Tone = .accent
    ) {
        self.id = id
        self.icon = icon
        self.label = label
        self.badge = badge
        self.dot = dot
        self.smallIcon = smallIcon
        self.active = active
        self.title = title
        self.badgeTone = badgeTone
    }
}

/// The vertical icon bar beside a side panel: the Swift side of ui/web `ActivityBar` (docs/components/ActivityBar.md).
/// One button per panel, the open one tinted with an accent line, and an optional count badge; entries after a
/// `.spacer` sit at the bottom, a `.divider` draws a short line. It is as tall as the room on offer. One canvas draws
/// every button; a button's tooltip is AppKit's while the pointer is over it.
public struct NActivityBar: View {
    private let entries: [NActivityEntry]
    @Binding private var active: String?
    private let label: String
    private let side: NActivityBarSide
    private let onSelect: ((String) -> Void)?
    private let placed = NActivityBarPlaced()
    @State private var hovered: Int?

    public init(
        entries: [NActivityEntry], active: Binding<String?>, label: String, side: NActivityBarSide = .left,
        onSelect: ((String) -> Void)? = nil
    ) {
        self.entries = entries
        _active = active
        self.label = label
        self.side = side
        self.onSelect = onSelect
    }

    private var items: [(index: Int, item: NActivityItem)] {
        entries.enumerated().compactMap { index, entry in
            if case .item(let item) = entry { (index, item) } else { nil }
        }
    }

    private func item(at index: Int?) -> NActivityItem? {
        guard let index, entries.indices.contains(index), case .item(let item) = entries[index] else {
            return nil
        }
        return item
    }

    public var body: some View {
        let (entries, placed, hot, side) = (entries, placed, hovered, side)
        let chosen = active
        NActivityBarFrame(entries: entries, placed: placed) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NActivityBarPaint.draw(
                            entries: entries, placed: placed, active: chosen, hovered: hot, side: side, size: size,
                            palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onContinuousHover { phase in
            let index: Int? = if case .active(let spot) = phase { placed.index(at: spot.y) } else { nil }
            if index != hovered {
                if let old = item(at: hovered) {
                    NHoverHelpHost.hide(old.title ?? old.label)
                }
                hovered = index
                if let new = item(at: index) {
                    NHoverHelpHost.show(new.title ?? new.label)
                }
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in
            if let item = item(at: placed.index(at: spot.y)) {
                active = item.id
                onSelect?(item.id)
            }
        }
        .accessibilityRepresentation {
            VStack {
                ForEach(items, id: \.index) { entry in
                    Button(entry.item.label) {
                        active = entry.item.id
                        onSelect?(entry.item.id)
                    }
                    .accessibilityAddTraits((entry.item.active ?? (entry.item.id == active)) ? .isSelected : [])
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }
}

/// Where each entry's box starts and how tall it is, from the bar's top.
final class NActivityBarPlaced: @unchecked Sendable {
    var tops: [CGFloat] = []
    var heights: [CGFloat] = []

    /// The entry whose box holds `y`.
    func index(at y: CGFloat) -> Int? {
        tops.indices.first { y >= tops[$0] && y < tops[$0] + heights[$0] }
    }
}

/// The bar's size: the token width and the height on offer (or its entries' when none); entries go top to bottom
/// with the gap between them, and the spacers share the room left.
private struct NActivityBarFrame: Layout {
    let entries: [NActivityEntry]
    let placed: NActivityBarPlaced

    private static func height(_ entry: NActivityEntry) -> CGFloat {
        switch entry {
        case .item: GMActivityBarTokens.item
        case .spacer: 0
        case .divider: 1 + 2 * GMActivityBarTokens.separatorSpace
        }
    }

    private var natural: CGFloat {
        entries.reduce(0) { $0 + Self.height($1) } + CGFloat(max(0, entries.count - 1)) * GMActivityBarTokens.gap
            + 2 * GMActivityBarTokens.padding
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let height = proposal.height.flatMap { $0.isFinite ? max($0, natural) : nil } ?? natural
        return CGSize(width: GMActivityBarTokens.width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let spacers = entries.filter { if case .spacer = $0 { true } else { false } }.count
        let share = spacers > 0 ? max(0, bounds.height - natural) / CGFloat(spacers) : 0
        var y = GMActivityBarTokens.padding
        placed.tops = []
        placed.heights = []
        for entry in entries {
            let height = if case .spacer = entry { share } else { Self.height(entry) }
            placed.tops.append(y)
            placed.heights.append(height)
            y += height + GMActivityBarTokens.gap
        }
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
