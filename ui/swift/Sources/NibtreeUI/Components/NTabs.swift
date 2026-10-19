import NibtreeTokens
import SwiftUI

/// A row of tabs' look: `panel` (small capitals with an accent bar, like the bottom panel's Terminal / Run / Git
/// Console) or `underline` (Search Everywhere's scopes: normal case, a thick accent line under the chosen one).
public enum NTabsVariant: String, CaseIterable, Sendable {
    case panel, underline
}

/// One tab: its value, its words and an optional tooltip.
public struct NTab<Value: Hashable & Sendable>: Sendable {
    public let value: Value
    public let label: String
    public let title: String?

    public init(value: Value, label: String, title: String? = nil) {
        self.value = value
        self.label = label
        self.title = title
    }
}

/// Panel tabs: the Swift side of ui/web `Tabs` (docs/components/Tabs.md). The arrow keys, Home and End move between
/// them. `keepFocus` (tabs over a search field) leaves the keyboard's focus where it was: the tabs take none. One
/// canvas draws every tab; a tab's tooltip is AppKit's while the pointer is over it.
public struct NTabs<Value: Hashable & Sendable>: View {
    private let tabs: [NTab<Value>]
    @Binding private var value: Value
    private let label: String
    private let keepFocus: Bool
    private let onChange: ((Value) -> Void)?
    private let look: NTabsLook
    @State private var hovered: Int?

    public init(
        tabs: [NTab<Value>], value: Binding<Value>, label: String, variant: NTabsVariant = .panel,
        keepFocus: Bool = false, onChange: ((Value) -> Void)? = nil
    ) {
        self.tabs = tabs
        _value = value
        self.label = label
        self.keepFocus = keepFocus
        self.onChange = onChange
        look = NTabsLook(
            labels: tabs.map(\.label), chosen: tabs.firstIndex { $0.value == value.wrappedValue }, variant: variant)
    }

    private func choose(_ index: Int) {
        guard tabs.indices.contains(index), tabs[index].value != value else {
            return
        }
        value = tabs[index].value
        onChange?(value)
    }

    public var body: some View {
        let (look, hot) = (look, hovered)
        NTabsFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovered: hot, size: size, palette: palette, scale: scale, in: cg)
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
            if let index = look.placed.index(at: spot.x) {
                choose(index)
            }
        }
        .focusable(!keepFocus)
        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .home, .end]) { press in
            let current = max(0, tabs.firstIndex { $0.value == value } ?? 0)
            let step: NRoving.Key =
                switch press.key {
                case .home: .first
                case .end: .last
                case .leftArrow, .upArrow: .previous
                default: .next
                }
            choose(NRoving.next(current, count: tabs.count, key: step))
            return .handled
        }
        .accessibilityRepresentation {
            Picker(label, selection: $value) {
                ForEach(tabs.indices, id: \.self) { index in
                    Text(tabs[index].label).tag(tabs[index].value)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    /// The tab under the pointer, and its tooltip.
    private func point(at spot: CGPoint?) {
        let index = spot.flatMap { look.placed.index(at: $0.x) }
        if index == hovered {
            return
        }
        if let old = hovered, let title = tabs[old].title {
            NHoverHelpHost.hide(title)
        }
        hovered = index
        if let index, let title = tabs[index].title {
            NHoverHelpHost.show(title)
        }
    }
}
