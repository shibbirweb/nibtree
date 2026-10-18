import NibtreeTokens
import SwiftUI

public enum NSplitDirection: String, CaseIterable, Sendable { case row, column }
/// Which pane `size` belongs to; the other takes the rest.
public enum NSplitSized: String, CaseIterable, Sendable { case first, second }

/// Two panes side by side (or one above the other) with an `NResizeHandle` between them: the Swift side of ui/web
/// `SplitPane` (docs/components/SplitPane.md). `size` is the sized pane's width or height in points, and the other
/// takes the rest; the second pane has a line on its edge toward the first. Without a second pane the first is shown
/// alone. `extent` reports the split's own width (row) or height (column), so the caller can work out `max`.
public struct NSplitPane<First: View, Second: View>: View {
    private let direction: NSplitDirection
    @Binding private var size: Double
    private let sized: NSplitSized
    private let preset: NPanelPreset
    private let max: Double
    private let label: String
    private let extent: Binding<Double>?
    private let inPanel: Bool
    private let oncommit: ((Double) -> Void)?
    private let first: First
    private let second: Second?

    @Environment(\.nibtreePalette) private var palette
    /// The last length reported to `extent`.
    @State private var measure = NSplitMeasure()
    /// The handle draws nothing until pointed at, so it is made the first time the pointer enters the split (and kept,
    /// so a drag that leaves the split goes on), or always for VoiceOver.
    @State private var interactive = false
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    /// `size` and `max` are points (data: a dragged pane size and its limit).
    public init(
        direction: NSplitDirection = .row, size: Binding<Double>, sized: NSplitSized = .first,
        preset: NPanelPreset = .pane, max: Double = 800, label: String, extent: Binding<Double>? = nil,
        inPanel: Bool = false, oncommit: ((Double) -> Void)? = nil, @ViewBuilder first: () -> First,
        @ViewBuilder second: () -> Second
    ) {
        self.direction = direction
        _size = size
        self.sized = sized
        self.preset = preset
        self.max = max
        self.label = label
        self.extent = extent
        self.inPanel = inPanel
        self.oncommit = oncommit
        self.first = first()
        self.second = second()
    }

    private var row: Bool { direction == .row }

    /// Where the sized pane sits relative to the handle.
    private var handleSide: NPanelSide {
        row ? (sized == .first ? .left : .right) : (sized == .first ? .top : .bottom)
    }

    /// Writes the split's measured length to `extent`, when there is one.
    private var reportLength: (@MainActor @Sendable (Double) -> Void)? {
        guard let extent else {
            return nil
        }
        return { length in extent.wrappedValue = length }
    }

    public var body: some View {
        NSplitLayout(
            row: row, size: size, sizedFirst: sized == .first,
            onLength: reportLength, measure: measure
        ) {
            first.clipped()
            if let second {
                if interactive || voiceOver {
                    NResizeHandle(
                        size: size, side: handleSide, preset: preset, max: max, label: label, inPanel: inPanel,
                        onresize: { size = $0 }, oncommit: oncommit)
                }
                second.clipped()
            }
        }
        .onHover { inside in
            if inside && !interactive {
                interactive = true
            }
        }
        .background {
            if second != nil {
                // The second pane's line, inside its box like the web's border, from the layout's own numbers.
                let (row, size, sizedFirst, color) = (row, size, sized == .first, palette.color(.borderStrong))
                Canvas(opaque: false, rendersAsynchronously: false) { context, box in
                    let length = row ? box.width : box.height
                    let edge = NSplitLayout.firstLength(length, size: size, sizedFirst: sizedFirst) + 1
                    let rect = row
                        ? CGRect(x: edge, y: 0, width: 1, height: box.height)
                        : CGRect(x: 0, y: edge, width: box.width, height: 1)
                    context.fill(Path(rect), with: .color(color))
                }
            }
        }
    }
}

extension NSplitPane where Second == EmptyView {
    /// The first pane alone, kept mounted so its content does not move when a second appears.
    public init(
        direction: NSplitDirection = .row, size: Binding<Double>, sized: NSplitSized = .first,
        preset: NPanelPreset = .pane, max: Double = 800, label: String, extent: Binding<Double>? = nil,
        inPanel: Bool = false, oncommit: ((Double) -> Void)? = nil, @ViewBuilder first: () -> First
    ) {
        self.direction = direction
        _size = size
        self.sized = sized
        self.preset = preset
        self.max = max
        self.label = label
        self.extent = extent
        self.inPanel = inPanel
        self.oncommit = oncommit
        self.first = first()
        self.second = nil
    }
}
