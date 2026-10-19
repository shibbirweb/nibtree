import NibtreeTokens
import SwiftUI

/// Choices stacked (`column`) or side by side (`row`).
public enum NRadioGroupDirection: String, CaseIterable, Sendable {
    case column, row
}

/// `stacked` puts a choice's description under its label; `columns` lines labels and hints up in columns.
public enum NRadioGroupLayout: String, CaseIterable, Sendable {
    case stacked, columns
}

/// One choice of a radio group; `danger` makes its label red, for a choice that throws work away (reset --hard).
public struct NRadioOption<Value: Hashable & Sendable>: Sendable {
    public let value: Value
    public let label: String
    public let description: String?
    public let disabled: Bool
    public let danger: Bool

    public init(
        value: Value, label: String, description: String? = nil, disabled: Bool = false, danger: Bool = false
    ) {
        self.value = value
        self.label = label
        self.description = description
        self.disabled = disabled
        self.danger = danger
    }
}

/// Radio buttons for one choice among a few, each with an optional description under its label: the Swift side of
/// ui/web `RadioGroup` (docs/components/RadioGroup.md). The radios are drawn like WebKit's, in the system's colors.
/// One canvas draws every choice; a click picks the one under the pointer and the arrow keys move the choice. The
/// web's `name` groups HTML inputs and has no Swift side.
public struct NRadioGroup<Value: Hashable & Sendable>: View {
    private let options: [NRadioOption<Value>]
    @Binding private var value: Value
    private let label: String
    private let look: NRadioGroupLook

    public init(
        options: [NRadioOption<Value>], value: Binding<Value>, label: String,
        direction: NRadioGroupDirection = .column, layout: NRadioGroupLayout = .stacked,
        labelWidth: NLabelColumn = .large
    ) {
        self.options = options
        _value = value
        self.label = label
        look = NRadioGroupLook(
            labels: options.map(\.label), notes: options.map(\.description), danger: options.map(\.danger),
            disabled: options.map(\.disabled), chosen: options.firstIndex { $0.value == value.wrappedValue },
            direction: direction, layout: layout, labelWidth: labelWidth)
    }

    public var body: some View {
        let look = look
        NRadioGroupFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, _ in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(palette: palette, scale: scale, environment: context.environment, in: cg)
                    }
                }
            }
        }
        .onTapGesture(coordinateSpace: .local) { spot in
            if let index = look.placed.index(at: spot), !options[index].disabled {
                value = options[index].value
            }
        }
        .focusable()
        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .home, .end]) { press in
            let current = max(0, options.firstIndex { $0.value == value } ?? 0)
            let key: NRoving.Key =
                switch press.key {
                case .home: .first
                case .end: .last
                case .leftArrow, .upArrow: .previous
                default: .next
                }
            let next = NRoving.next(current, count: options.count, key: key) { options[$0].disabled }
            if next >= 0 {
                value = options[next].value
            }
            return .handled
        }
        .accessibilityRepresentation {
            Picker(label, selection: $value) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label).tag(options[index].value)
                }
            }
            .pickerStyle(.radioGroup)
        }
    }
}

/// The group's choices in a column or a row with the token gaps; a column's choices are as wide as the group.
private struct NRadioGroupFrame: Layout {
    let look: NRadioGroupLook

    @MainActor
    private func choices(width: CGFloat?) -> [NRadioGroupPlaced.Choice] {
        var choices: [NRadioGroupPlaced.Choice] = []
        var along: CGFloat = 0
        for item in look.items {
            var choice = look.measure(item, width: look.row ? nil : width)
            choice.origin = look.row ? CGPoint(x: along, y: 0) : CGPoint(x: 0, y: along)
            along += (look.row ? choice.size.width : choice.size.height) + look.gap
            choices.append(choice)
        }
        return choices
    }

    private static func size(_ choices: [NRadioGroupPlaced.Choice]) -> CGSize {
        CGSize(
            width: choices.map { $0.origin.x + $0.size.width }.max() ?? 0,
            height: choices.map { $0.origin.y + $0.size.height }.max() ?? 0)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let natural = Self.size(MainActor.assumeIsolated { choices(width: width) })
        return CGSize(width: width ?? natural.width, height: natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.placed.choices = MainActor.assumeIsolated { choices(width: bounds.width) }
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
