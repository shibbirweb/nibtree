import NibtreeTokens
import SwiftUI

/// `small` is a file bar's tight box of narrow icon segments.
public enum NSegmentedSize: String, CaseIterable, Sendable {
    case normal, small
}

/// `pill` is a tinted box with the chosen segment raised, `joined` buttons side by side in one bordered box (a gist's
/// Public or Secret), `split` equal parts filling the width, the chosen one bold (commit options' signing mode).
public enum NSegmentedVariant: String, CaseIterable, Sendable {
    case pill, joined, split
}

/// One choice of a segmented control: words, an icon, or both; `title` is its tooltip (and its name when it has no
/// words).
public struct NSegmentedOption<Value: Hashable & Sendable>: Sendable {
    public let value: Value
    public let label: String?
    public let icon: GMIconName?
    public let title: String?
    public let disabled: Bool

    public init(
        value: Value, label: String? = nil, icon: GMIconName? = nil, title: String? = nil, disabled: Bool = false
    ) {
        self.value = value
        self.label = label
        self.icon = icon
        self.title = title
        self.disabled = disabled
    }
}

/// A row of mutually exclusive choices (a toggle group), like Settings' Light / Dark / System: the Swift side of
/// ui/web `Segmented` (docs/components/Segmented.md). The arrow keys move the choice. One canvas draws the box and
/// every segment; a segment's tooltip is AppKit's while the pointer is over it.
public struct NSegmented<Value: Hashable & Sendable>: View {
    private let options: [NSegmentedOption<Value>]
    @Binding private var value: Value
    private let label: String
    private let disabled: Bool
    private let look: NSegmentedLook
    @State private var hovered: Int?

    public init(
        options: [NSegmentedOption<Value>], value: Binding<Value>, label: String, disabled: Bool = false,
        size: NSegmentedSize = .normal, variant: NSegmentedVariant = .pill
    ) {
        self.options = options
        _value = value
        self.label = label
        self.disabled = disabled
        look = NSegmentedLook(
            labels: options.map(\.label), icons: options.map(\.icon),
            disabled: options.map { disabled || $0.disabled },
            chosen: options.firstIndex { $0.value == value.wrappedValue }, size: size, variant: variant)
    }

    public var body: some View {
        let (look, hot) = (look, hovered)
        NSegmentedFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NSegmentedFace.draw(
                            look, hovered: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .onContinuousHover { phase in
            switch phase {
            case .active(let spot):
                point(at: spot)
            case .ended:
                point(at: nil)
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in
            if let index = look.placed.index(at: spot.x), !look.segments[index].disabled {
                value = options[index].value
            }
        }
        .focusable(!disabled)
        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .home, .end]) { press in
            move(press.key)
        }
        .accessibilityRepresentation {
            Picker(label, selection: $value) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label ?? options[index].title ?? "").tag(options[index].value)
                }
            }
            .pickerStyle(.segmented)
            .disabled(disabled)
        }
    }

    /// The segment under the pointer, and its tooltip.
    private func point(at spot: CGPoint?) {
        let index = spot.flatMap { look.placed.index(at: $0.x) }
        if index == hovered {
            return
        }
        if let old = hovered, let title = options[old].title {
            NHoverHelpHost.hide(title)
        }
        hovered = index
        if let index, let title = options[index].title {
            NHoverHelpHost.show(title)
        }
    }

    /// The arrow keys move the choice to the next segment that can be chosen, wrapping around like the web's.
    private func move(_ key: KeyEquivalent) -> KeyPress.Result {
        let current = max(0, options.firstIndex { $0.value == value } ?? 0)
        let step: NRoving.Key =
            switch key {
            case .home: .first
            case .end: .last
            case .leftArrow, .upArrow: .previous
            default: .next
            }
        let next = NRoving.next(current, count: options.count, key: step) { look.segments[$0].disabled }
        if next >= 0 {
            value = options[next].value
        }
        return .handled
    }
}
