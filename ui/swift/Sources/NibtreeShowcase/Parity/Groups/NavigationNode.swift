import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Navigation group's components, resolved from a scenario node. An open state is the scenario's (`.constant`).
enum NavigationNode: Sendable {
    case collapsible(CollapsibleProps, children: [ResolvedNode], actions: [ResolvedNode]?)
    case breadcrumbs(crumbs: [NCrumb], label: String, open: Int?, variant: NBreadcrumbs.Variant, at: ScenarioFixed?)

    struct CollapsibleProps: Sendable {
        let title: String
        let open: Bool
        let count: Int?
        let nested: Bool
        let dim: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Collapsible":
            let props = CollapsibleProps(
                title: node.string("title") ?? "", open: node.props?["open"] == nil ? true : node.flag("open"),
                count: node.number("count").map { Int($0) }, nested: node.flag("nested"), dim: node.flag("dim"))
            let actions = node.slots?["actions"].map(ResolvedNode.list)
            self = .collapsible(props, children: ResolvedNode.list(node.children), actions: actions)
        case "Breadcrumbs":
            let variant = node.string("variant").flatMap(NBreadcrumbs.Variant.init) ?? .inline
            var at: ScenarioFixed?
            if let spot = node.record("at") {
                at = ScenarioFixed(top: Self.points(spot["top"]) ?? 0, left: Self.points(spot["left"]),
                    maxWidth: Self.points(spot["maxWidth"]))
            }
            let floating = ScenarioFixed(top: GMBreadcrumbsTokens.floatingTop, left: nil, maxWidth: nil)
            self = .breadcrumbs(
                crumbs: (node.list("crumbs") ?? []).compactMap { $0.record.map(Self.crumb) },
                label: node.string("label") ?? "Path", open: node.number("open").map { Int($0) }, variant: variant,
                at: variant == .floating ? floating : variant == .anchored ? at : nil)
        default:
            return nil
        }
    }

    private static func points(_ value: PropValue?) -> CGFloat? {
        guard let number = value?.numberValue else {
            return nil
        }
        return CGFloat(number)
    }

    /// A crumb of the scenario: `{ label, icon?, fileIcon?, kind? }` (`fileIcon: null` is the plain file icon).
    private static func crumb(_ crumb: [String: PropValue]) -> NCrumb {
        let label = crumb["label"]?.text ?? ""
        let kind = crumb["kind"]?.text.flatMap(NCrumb.Kind.init) ?? .folder
        if let fileIcon = crumb["fileIcon"] {
            let words = fileIcon.record?.compactMapValues(\.text)
            let view = words.map { ActionsNode.fileIconView($0) } ?? nil
            return NCrumb(label, fileIcon: view, kind: kind)
        }
        return NCrumb(label, icon: crumb["icon"]?.text.flatMap(GMIconName.init), kind: kind)
    }
}

extension NavigationNode {
    /// The component, drawn straight into `ScenarioView`'s switch.
    @MainActor @Erased
    var view: AnyView {
        switch self {
        case .breadcrumbs(let crumbs, let label, let open, let variant, let at):
            if let at {
                // The web's floating and anchored bars are `position: fixed`.
                at { NBreadcrumbs(crumbs: crumbs, label: label, open: open, variant: variant) }
            } else {
                NBreadcrumbs(crumbs: crumbs, label: label, open: open, variant: variant)
            }
        case .collapsible(let props, let children, let actions):
            if let actions {
                NCollapsible(
                    title: props.title, open: .constant(props.open), count: props.count, nested: props.nested,
                    dim: props.dim
                ) { hovering in
                    // Like the web, icon buttons show only while the header is hovered.
                    ScenarioChildren(nodes: hovering ? actions : actions.filter { !$0.isIconButton })
                } content: {
                    ScenarioChildren(nodes: children)
                }
            } else {
                NCollapsible(
                    title: props.title, open: .constant(props.open), count: props.count, nested: props.nested,
                    dim: props.dim
                ) {
                    ScenarioChildren(nodes: children)
                }
            }
        }
    }
}

extension ResolvedNode {
    var isIconButton: Bool {
        switch self {
        case .actions(.iconButton), .actions(.iconButtonWith): true
        default: false
        }
    }
}

/// The web's `position: fixed` in a scenario: the child at `top` and `left` from the frame's corner (centered across
/// it when `left` is nil), as wide as its content up to `maxWidth` (the frame less `--space-8` each side when nil),
/// taking no room of its own.
struct ScenarioFixed: Layout, Sendable {
    let top: CGFloat
    let left: CGFloat?
    let maxWidth: CGFloat?

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 0, height: 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for subview in subviews {
            let limit = maxWidth ?? bounds.width - 2 * GMSpace.s8
            let width = min(subview.sizeThatFits(.unspecified).width, limit)
            let x = left.map { bounds.minX + $0 } ?? bounds.midX - width / 2
            subview.place(
                at: CGPoint(x: x, y: bounds.minY + top), anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: nil))
        }
    }
}
