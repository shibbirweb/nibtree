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

    @State private var hovering = false
    @State private var startSize: Double?
    @Environment(\.nibtreePalette) private var palette

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
    private var active: Bool { hovering || startSize != nil }

    public var body: some View {
        let thickness = active ? GMResizeHandleTokens.activeLine : GMResizeHandleTokens.line
        // One point in the layout; the bar and the pointer's area are drawn over the panels on both sides.
        Color.clear
            .frame(width: horizontal ? nil : 1, height: horizontal ? 1 : nil)
            .overlay {
                Rectangle()
                    .fill(active ? palette.color(.accent) : .clear)
                    .frame(width: horizontal ? nil : thickness, height: horizontal ? thickness : nil)
                    .frame(
                        width: horizontal ? nil : GMResizeHandleTokens.hitArea,
                        height: horizontal ? GMResizeHandleTokens.hitArea : nil
                    )
                    .contentShape(Rectangle())
                    .onHover { inside in
                        hovering = inside
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
                let start = startSize ?? size
                startSize = start
                let delta = horizontal ? drag.translation.height : drag.translation.width
                onresize(NSplitMath.draggedSize(side, start: start, delta: delta, min: lowest, max: maxSize()))
            }
            .onEnded { _ in
                startSize = nil
                oncommit?(size)
            }
    }

    private func commit(_ next: Double) {
        onresize(next)
        oncommit?(next)
    }
}
