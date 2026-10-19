import NibtreeTokens
import SwiftUI

/// How deep a sidebar row sits under its groups.
public enum NSidebarRowDepth: String, CaseIterable, Sendable {
    case none, one, two, three

    var level: Int {
        switch self {
        case .none: 0
        case .one: 1
        case .two: 2
        case .three: 3
        }
    }
}

/// A row of the sidebar's lists: branches, tags, stashes and worktrees: the Swift side of ui/web `SidebarRow`
/// (docs/components/SidebarRow.md). A chevron for groups (`expanded`), an icon (accent for the `current` branch), the
/// name, then a count, ahead/behind numbers, dim detail and the row's `actions` on hover. `section` draws a group
/// heading in small capitals with its actions always at the end. A click toggles a group or calls `action` on a leaf.
/// One canvas draws all of it but the actions. `title` is the row's tooltip; the web's `oncontextmenu` is the
/// caller's `.contextMenu`. A selected row takes the inactive selection color until the lists' focus follows with
/// the Tree component.
public struct NSidebarRow<Actions: View>: View {
    private let look: NSidebarRowLook
    private let title: String?
    private let action: (() -> Void)?
    private let doubleAction: (() -> Void)?
    private let onToggle: (() -> Void)?
    private let actions: Actions
    private let placed = NSidebarRowPlaced()
    @State private var hovering = false

    public init(
        label: String, depth: NSidebarRowDepth = .none, icon: GMIconName? = nil, current: Bool = false,
        strong: Bool = false, section: Bool = false, expanded: Bool? = nil, count: Int? = nil, ahead: Int = 0,
        behind: Int = 0, path: String = "", detail: String = "", gone: Bool = false, selected: Bool = false,
        title: String? = nil, action: (() -> Void)? = nil, doubleAction: (() -> Void)? = nil,
        onToggle: (() -> Void)? = nil, @ViewBuilder actions: () -> Actions
    ) {
        look = NSidebarRowLook(
            NSidebarRowProps(
                label: label, depth: depth, icon: icon, current: current, strong: strong, section: section,
                expanded: expanded, count: count, ahead: ahead, behind: behind, path: path, detail: detail,
                gone: gone, selected: selected))
        self.title = title
        self.action = action
        self.doubleAction = doubleAction
        self.onToggle = onToggle
        self.actions = actions()
    }

    /// A section's `margin-top: var(--space-2)`.
    private static var sectionMargin: NStackMargin { NStackMargin(first: GMSpace.s2, other: GMSpace.s2) }

    public var body: some View {
        let (look, placed, hot) = (look, placed, hovering)
        let acts = Actions.self != EmptyView.self
        NSidebarRowLayout(look: look, placed: placed, acts: acts, hovering: hot) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(
                            hovering: hot, acts: acts, placed: placed, size: size, palette: palette, scale: scale,
                            in: cg)
                    }
                }
            }
            if acts && look.showsActions(hovering: hot) {
                HStack(spacing: NSidebarRowLook.actionsGap) { actions }
            }
        }
        .layoutValue(key: NStackMargin.self, value: look.section ? Self.sectionMargin : nil)
        .contentShape(Rectangle())
        .onHover { inside in
            hovering = inside
            if let title {
                if inside {
                    NHoverHelpHost.show(title)
                } else {
                    NHoverHelpHost.hide(title)
                }
            }
        }
        .onTapGesture(count: 2) { doubleAction?() }
        .onTapGesture {
            if look.expanded == nil {
                action?()
            } else {
                onToggle?()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.label.text)
        .accessibilityAddTraits(look.selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityValue(look.expanded.map { $0 ? "Expanded" : "Collapsed" } ?? "")
    }
}

extension NSidebarRow where Actions == EmptyView {
    /// A row without buttons.
    public init(
        label: String, depth: NSidebarRowDepth = .none, icon: GMIconName? = nil, current: Bool = false,
        strong: Bool = false, section: Bool = false, expanded: Bool? = nil, count: Int? = nil, ahead: Int = 0,
        behind: Int = 0, path: String = "", detail: String = "", gone: Bool = false, selected: Bool = false,
        title: String? = nil, action: (() -> Void)? = nil, doubleAction: (() -> Void)? = nil,
        onToggle: (() -> Void)? = nil
    ) {
        self.init(
            label: label, depth: depth, icon: icon, current: current, strong: strong, section: section,
            expanded: expanded, count: count, ahead: ahead, behind: behind, path: path, detail: detail, gone: gone,
            selected: selected, title: title, action: action, doubleAction: doubleAction, onToggle: onToggle
        ) { EmptyView() }
    }
}

/// The row's size (the token height, the width on offer or its parts' natural width), the canvas filling it and the
/// actions where `NSidebarRowLook.parts` puts them.
private struct NSidebarRowLayout: Layout {
    let look: NSidebarRowLook
    let placed: NSidebarRowPlaced
    let acts: Bool
    let hovering: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        if let width = proposal.width, width.isFinite {
            return CGSize(width: width, height: GMSidebarRowTokens.height)
        }
        let actions = subviews.dropFirst().first?.sizeThatFits(.unspecified).width
        let natural = MainActor.assumeIsolated {
            look.naturalWidth(actions: actions, actionsAcceptDetail: look.showsDetail(hovering: hovering, acts: acts))
        }
        return CGSize(width: natural, height: GMSidebarRowTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        guard let actions = subviews.dropFirst().first else {
            placed.actions = nil
            return
        }
        let size = actions.sizeThatFits(.unspecified)
        placed.actions = size.width
        let parts = MainActor.assumeIsolated {
            look.parts(
                width: bounds.width, actions: size.width,
                actionsAcceptDetail: look.showsDetail(hovering: hovering, acts: acts))
        }
        actions.place(
            at: CGPoint(x: bounds.minX + (parts.actions ?? 0), y: bounds.midY), anchor: .leading,
            proposal: ProposedViewSize(size))
    }
}
