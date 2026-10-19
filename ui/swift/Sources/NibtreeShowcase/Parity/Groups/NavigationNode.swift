import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Navigation group's components, resolved from a scenario node. An open state is the scenario's (`.constant`).
enum NavigationNode: Sendable {
    case collapsible(CollapsibleProps, children: [ResolvedNode], actions: [ResolvedNode]?)
    case editorTab(
        NEditorTabData, active: Bool, focused: Bool, layout: NEditorTabLayout, look: NEditorTabLookStyle, lifted: Bool,
        closable: Bool)
    case activityBar(entries: [NActivityEntry], active: String?, label: String, side: NActivityBarSide)
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
        case "EditorTab":
            let tab = node.record("tab") ?? [:]
            let flag = { (name: String) -> Bool in if case .bool(true)? = tab[name] { true } else { false } }
            let data = NEditorTabData(
                id: tab["id"]?.text ?? "", label: tab["label"]?.text ?? "",
                icon: tab["icon"]?.text.flatMap(GMIconName.init),
                iconTone: tab["iconTone"]?.text.flatMap(NEditorTabIconTone.init), hint: tab["hint"]?.text,
                title: tab["title"]?.text, preview: flag("preview"), dirty: flag("dirty"), pinned: flag("pinned"),
                mono: flag("mono"), fixed: flag("fixed"))
            self = .editorTab(
                data, active: node.flag("active"), focused: node.props?["focused"] == nil ? true : node.flag("focused"),
                layout: node.string("layout").flatMap(NEditorTabLayout.init) ?? .scroll,
                look: node.string("look").flatMap(NEditorTabLookStyle.init) ?? .flat, lifted: node.flag("lifted"),
                closable: node.props?["closable"] == nil ? true : node.flag("closable"))
        case "ActivityBar":
            let entries = (node.list("items") ?? []).map { entry -> NActivityEntry in
                guard let item = entry.record else {
                    return entry.text == "divider" ? .divider : .spacer
                }
                let flag = { (name: String) -> Bool? in if case .bool(let on)? = item[name] { on } else { nil } }
                return .item(
                    NActivityItem(
                        id: item["id"]?.text ?? "", icon: item["icon"]?.text.flatMap(GMIconName.init) ?? .file,
                        label: item["label"]?.text ?? "", badge: item["badge"]?.numberValue.map { Int($0) },
                        dot: flag("dot") ?? false, smallIcon: flag("smallIcon") ?? false, active: flag("active"),
                        title: item["title"]?.text,
                        badgeTone: item["badgeTone"]?.text.flatMap(NBadge.Tone.init) ?? .accent))
            }
            self = .activityBar(
                entries: entries, active: node.string("active"), label: node.string("label") ?? "",
                side: node.string("side").flatMap(NActivityBarSide.init) ?? .left)
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
        case .editorTab(let tab, let active, let focused, let layout, let look, let lifted, let closable):
            NEditorTab(
                tab: tab, active: active, focused: focused, layout: layout, look: look, lifted: lifted,
                closable: closable)
        case .activityBar(let entries, let active, let label, let side):
            NActivityBar(entries: entries, active: .constant(active), label: label, side: side)
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
