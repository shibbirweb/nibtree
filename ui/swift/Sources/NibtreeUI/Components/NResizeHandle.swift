import AppKit
import NibtreeTokens
import SwiftUI

/// A drag handle on a panel's edge: the Swift side of ui/web `ResizeHandle` (docs/components/ResizeHandle.md). It
/// takes one point of the layout and a wider area for the pointer, draws nothing at rest and an accent bar when
/// pointed at or dragged. Drag it; double-click resets. VoiceOver adjusts it like a macOS split view's divider,
/// which is not in the Tab order, so the web's arrow keys are left out.
/// `side` is where the panel is; the preset gives the smallest and default size unless `min` and `defaultSize` do.
/// `inPanel` keeps its size inside a rounded panel (AppShell's rounded look); it changes nothing on its own.
public struct NResizeHandle: View {
    private let size: Double
    private let side: NPanelSide
    private let preset: NPanelPreset
    /// Read when dragged, so a frame can pass the length it measured in its own layout.
    private let maxSize: () -> Double
    private let min: Double?
    private let defaultSize: Double?
    private let label: String
    private let inPanel: Bool
    private let onresize: (Double) -> Void
    private let oncommit: ((Double) -> Void)?

    /// Pointed at, and the size when a drag started: one state, as each one costs every handle a node.
    @State private var pointer = NHandlePointer()
    @Environment(\.nibtreeForcedState) private var forced

    /// `size`, `max`, `min` and `defaultSize` are points (data: a panel's dragged size and its limits).
    public init(
        size: Double, side: NPanelSide, preset: NPanelPreset, max: Double, min: Double? = nil,
        defaultSize: Double? = nil, label: String, inPanel: Bool = false, onresize: @escaping (Double) -> Void,
        oncommit: ((Double) -> Void)? = nil
    ) {
        self.init(
            size: size, side: side, preset: preset, maxSize: { max }, min: min, defaultSize: defaultSize, label: label,
            inPanel: inPanel, onresize: onresize, oncommit: oncommit)
    }

    init(
        size: Double, side: NPanelSide, preset: NPanelPreset, maxSize: @escaping () -> Double, min: Double? = nil,
        defaultSize: Double? = nil, label: String, inPanel: Bool = false, onresize: @escaping (Double) -> Void,
        oncommit: ((Double) -> Void)? = nil
    ) {
        self.size = size
        self.side = side
        self.preset = preset
        self.maxSize = maxSize
        self.min = min
        self.defaultSize = defaultSize
        self.label = label
        self.inPanel = inPanel
        self.onresize = onresize
        self.oncommit = oncommit
    }

    private var lowest: Double { min ?? preset.min }
    private var horizontal: Bool { side == .top || side == .bottom }
    private var active: Bool { pointer.hovering || pointer.startSize != nil || forced.showsHandle }

    public var body: some View {
        let (active, horizontal) = (active, horizontal)
        // One point in the layout; the pointer's area and the bar are drawn over the panels on both sides.
        NHandleArea(horizontal: horizontal) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                guard active else {
                    return
                }
                let (thickness, area) = (GMResizeHandleTokens.activeLine, GMResizeHandleTokens.hitArea)
                let bar = horizontal
                    ? CGRect(x: 0, y: (area - thickness) / 2, width: box.width, height: thickness)
                    : CGRect(x: (area - thickness) / 2, y: 0, width: thickness, height: box.height)
                MainActor.assumeIsolated {
                    context.fill(Path(bar), with: .color(context.environment.nibtreePalette.color(.accent)))
                }
            }
            .contentShape(Rectangle())
            .onHover { inside in
                pointer.hovering = inside
                inside ? (horizontal ? NSCursor.resizeUpDown : NSCursor.resizeLeftRight).push() : NSCursor.pop()
            }
            .gesture(drag)
            .onTapGesture(count: 2) { commit(defaultSize ?? preset.defaultSize) }
        }
            .zIndex(1)
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityValue("\(Int(size))")
            // VoiceOver's increment and decrement move it, like a macOS split view's divider (which is not in the
            // Tab order, so the arrow keys of the web version are left out).
            .accessibilityAdjustableAction { direction in
                let grow = side == .left || side == .top
                let key: NArrowKey = horizontal ? (grow == (direction == .increment) ? .down : .up)
                    : (grow == (direction == .increment) ? .right : .left)
                let next = NSplitMath.keyedSize(side, key: key, shift: false, size: size, min: lowest, max: maxSize())
                if let next {
                    commit(next)
                }
            }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .global)
            .onChanged { drag in
                let start = pointer.startSize ?? size
                pointer.startSize = start
                let delta = horizontal ? drag.translation.height : drag.translation.width
                onresize(NSplitMath.draggedSize(side, start: start, delta: delta, min: lowest, max: maxSize()))
            }
            .onEnded { _ in
                pointer.startSize = nil
                oncommit?(size)
            }
    }

    private func commit(_ next: Double) {
        onresize(next)
        oncommit?(next)
    }
}

struct NHandlePointer {
    var hovering = false
    var startSize: Double?
}

/// One point across the axis in the layout, the full length along it; its child, the pointer's area, is
/// `GMResizeHandleTokens.hitArea` across and centered on that point, over the panels on both sides.
private struct NHandleArea: Layout {
    let horizontal: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        horizontal
            ? CGSize(width: proposal.width ?? 0, height: 1) : CGSize(width: 1, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let area = GMResizeHandleTokens.hitArea
        let rect = horizontal
            ? CGRect(x: bounds.minX, y: bounds.midY - area / 2, width: bounds.width, height: area)
            : CGRect(x: bounds.midX - area / 2, y: bounds.minY, width: area, height: bounds.height)
        subviews.first?.place(at: rect.origin, anchor: .topLeading, proposal: ProposedViewSize(rect.size))
    }
}
