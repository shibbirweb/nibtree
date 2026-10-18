import AppKit
import NibtreeTokens
import SwiftUI

/// The handle between two side-by-side views inside one box: the Swift side of ui/web `SplitHandle`
/// (docs/components/SplitHandle.md). Put it over the box (`.overlay`); it stands at `ratio` of the box's width, less
/// `gutter` points that belong to neither side. It draws nothing until pointed at, focused or dragged, then an accent
/// line. Drag it; double-click puts it back at `resetRatio`. VoiceOver adjusts it like a macOS split view's divider,
/// which is not in the Tab order, so the web's arrow keys are left out.
public struct NSplitHandle: View {
    @Binding private var ratio: Double
    private let gutter: Double
    private let resetRatio: Double
    private let label: String
    private let oncommit: ((Double) -> Void)?

    @State private var hovering = false
    @State private var startRatio: Double?
    @Environment(\.nibtreePalette) private var palette
    @Environment(\.nibtreeForcedState) private var forced

    /// `gutter` is points (data: the space a layout keeps between the sides), not a design size.
    public init(
        ratio: Binding<Double>, gutter: Double = 0, resetRatio: Double = 0.5, label: String,
        oncommit: ((Double) -> Void)? = nil
    ) {
        _ratio = ratio
        self.gutter = gutter
        self.resetRatio = resetRatio
        self.label = label
        self.oncommit = oncommit
    }

    @State private var measure = NSplitMeasure()

    public var body: some View {
        NRatioPlacement(ratio: ratio, gutter: gutter, measure: measure) {
            Rectangle()
                .fill(hovering || startRatio != nil || forced.showsHandle ? palette.color(.accent) : .clear)
                .frame(width: GMSplitHandleTokens.line)
                .frame(width: GMSplitHandleTokens.width)
                .contentShape(Rectangle())
                .onHover { inside in
                    hovering = inside
                    inside ? NSCursor.resizeLeftRight.push() : NSCursor.pop()
                }
                .gesture(drag)
                .onTapGesture(count: 2) { commit(resetRatio) }
                .accessibilityElement()
                .accessibilityLabel(label)
                .accessibilityValue("\(Int((ratio * 100).rounded()))%")
                // VoiceOver's increment and decrement move it, like a macOS split view's divider (not in the Tab
                // order, so the web version's arrow keys are left out).
                .accessibilityAdjustableAction { direction in
                    commit(NSplitMath.keyedRatio(ratio, left: direction == .decrement, shift: false))
                }
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { drag in
                let start = startRatio ?? ratio
                startRatio = start
                let shared = measure.width
                ratio = NSplitMath.pointerRatio(start * shared + drag.translation.width, width: shared)
            }
            .onEnded { _ in
                startRatio = nil
                oncommit?(ratio)
            }
    }

    private func commit(_ next: Double) {
        ratio = next
        oncommit?(next)
    }
}
