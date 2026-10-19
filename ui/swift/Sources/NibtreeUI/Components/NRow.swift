import NibtreeTokens
import SwiftUI

/// A row's size: `tree`, `list`, `history`, `entry` (as tall as its content), `large` (a rounded block), `section` (a
/// repository's header in the Changes panel) or `group` (a row under a Collapsible's header).
public enum NRowSize: String, CaseIterable, Sendable {
    case tree, list, history, entry, large, section, group
}

/// A row's fold chevron: pointing down (`true`), right (`false`), or `leaf`, the chevron's room left empty. The raw
/// values are the web's, which takes a boolean or "leaf".
public enum NRowExpanded: String, CaseIterable, Sendable {
    case open = "true"
    case closed = "false"
    case leaf
}

/// How a row's children line up: centered, or on their first lines' baselines.
public enum NRowAlign: String, CaseIterable, Sendable {
    case center, baseline
}

/// When a row's actions show: under the pointer, or `always`.
public enum NRowActionsShown: String, CaseIterable, Sendable {
    case hover, always
}

/// One row of a list: the base every list row is built on, the Swift side of ui/web `Row` (docs/components/Row.md). It
/// draws the hover (when it has an `action`), the selected color, an optional fold chevron and indent, an accent `mark`
/// on its left edge, a `line` under it, and `actions` that show under the pointer. The content is the caller's views
/// (texts, icons, tags; an `NSpacer` pushes what follows to the end). Icons with no tone of their own take the row's
/// color, faint when `disabled` (an `NText` keeps its own, as the web's Text does). The web's `title` is SwiftUI's own
/// `.help(...)`; `cursor`, `id` and `item` belong to the web's lists and follow with the Swift ones.
public struct NRow<Content: View, Actions: View>: View {
    private let look: NRowLook
    private let label: String?
    private let action: (() -> Void)?
    private let doubleAction: (() -> Void)?
    private let content: Content
    private let actions: Actions

    public init(
        size: NRowSize = .list, selected: Bool = false, disabled: Bool = false, depth: Int = 0,
        expanded: NRowExpanded? = nil, align: NRowAlign = .center, actionsShown: NRowActionsShown = .hover,
        line: Bool = false, mark: Bool = false, label: String? = nil, action: (() -> Void)? = nil,
        doubleAction: (() -> Void)? = nil, @ViewBuilder content: () -> Content, @ViewBuilder actions: () -> Actions
    ) {
        look = NRowLook(
            size: size, selected: selected, disabled: disabled, depth: depth, expanded: expanded, align: align,
            alwaysShown: actionsShown == .always, line: line, mark: mark,
            interactive: action != nil || doubleAction != nil, acts: Actions.self != EmptyView.self)
        self.label = label
        self.action = action
        self.doubleAction = doubleAction
        self.content = content()
        self.actions = actions()
    }

    public var body: some View {
        if look.interactive || (look.acts && !look.alwaysShown) {
            NRowHovering(look: look, action: action, doubleAction: doubleAction, content: content, actions: actions)
                .modifier(NRowAccessibility(label: label, look: look))
        } else {
            NRowBody(look: look, hovering: false, content: content, actions: actions)
                .modifier(NRowAccessibility(label: label, look: look))
        }
    }
}

extension NRow where Actions == EmptyView {
    /// A row without actions.
    public init(
        size: NRowSize = .list, selected: Bool = false, disabled: Bool = false, depth: Int = 0,
        expanded: NRowExpanded? = nil, align: NRowAlign = .center, line: Bool = false, mark: Bool = false,
        label: String? = nil, action: (() -> Void)? = nil, doubleAction: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.init(
            size: size, selected: selected, disabled: disabled, depth: depth, expanded: expanded, align: align,
            line: line, mark: mark, label: label, action: action, doubleAction: doubleAction, content: content
        ) { EmptyView() }
    }
}

/// A row that watches the pointer: for its hover color, its actions, and its clicks.
private struct NRowHovering<Content: View, Actions: View>: View {
    let look: NRowLook
    let action: (() -> Void)?
    let doubleAction: (() -> Void)?
    let content: Content
    let actions: Actions
    @State private var hovering = false

    var body: some View {
        NRowBody(look: look, hovering: hovering, content: content, actions: actions)
            .onHover { hovering = $0 }
            .onTapGesture(count: 2) {
                if !look.disabled {
                    doubleAction?()
                }
            }
            .onTapGesture {
                if !look.disabled {
                    action?()
                }
            }
    }
}

private struct NRowBody<Content: View, Actions: View>: View {
    let look: NRowLook
    let hovering: Bool
    let content: Content
    let actions: Actions

    var body: some View {
        let (look, hot) = (look, hovering)
        NRowLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(hovering: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
            .layoutValue(key: NRowPart.self, value: .face)
            content
            if look.alwaysShown || hovering {
                actions.layoutValue(key: NRowPart.self, value: .actions)
            }
        }
        .environment(\.nibtreeCurrentColor, look.disabled ? .textFaint : .text)
    }
}

/// A row reads as its label, a button when it does something, selected when chosen.
private struct NRowAccessibility: ViewModifier {
    let label: String?
    let look: NRowLook

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label ?? "")
            .accessibilityAddTraits(look.selected ? .isSelected : [])
    }
}
