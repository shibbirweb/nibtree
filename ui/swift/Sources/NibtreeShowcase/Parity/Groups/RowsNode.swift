import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The list rows (Row and the rows built on it), resolved from a scenario node.
enum RowsNode: Sendable {
    case row(RowProps, content: [ResolvedNode], actions: [ResolvedNode]?)
    case popupRow(PopupRowProps)
    case settingRow(SettingRowProps, control: [ResolvedNode])

    struct SettingRowProps: Sendable {
        let title: String
        let matches: [Range<Int>]
        let hint: String
        let stacked, nested, plain: Bool
    }

    struct PopupRowProps: Sendable {
        let label: String
        let variant: NPopupRowVariant
        let icon: GMIconName?
        let hint: String
        let current, chevron, highlighted, disabled: Bool
    }

    case sidebarRow(SidebarRowProps, actions: [ResolvedNode]?)

    struct SidebarRowProps: Sendable {
        let label: String
        let depth: NSidebarRowDepth
        let icon: GMIconName?
        let current, strong, section, gone, selected: Bool
        let expanded: Bool?
        let count: Int?
        let ahead, behind: Int
        let path, detail: String
        let title: String?
    }

    case fileRow(FileRowProps)

    struct FileRowProps: Sendable {
        let kind: NStatusLetter.Kind?
        let name, directory, note, badge: String
        let icon: NFileIconView?
        let selected, nested: Bool
        let variant: NFileRowVariant
        let checked: Bool?
        let title: String?
        let actions: [NFileRowAction]
    }

    case listRow(
        label: String, description: String, icon: GMIconName?, highlighted: Bool, disabled: Bool,
        trailing: [ResolvedNode]?)

    struct RowProps: Sendable {
        let size: NRowSize
        let selected, disabled: Bool
        let depth: Int
        let expanded: NRowExpanded?
        let align: NRowAlign
        let actionsShown: NRowActionsShown
        let line, mark: Bool
        let label: String?
        /// The scenario's stand-in for the web's `onclick`.
        let pressable: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Row":
            // The web's `expanded` is a boolean or "leaf".
            let expanded: NRowExpanded? =
                node.string("expanded") == "leaf"
                ? .leaf : node.props?["expanded"] == nil ? nil : node.flag("expanded") ? .open : .closed
            let props = RowProps(
                size: node.string("size").flatMap(NRowSize.init) ?? .list, selected: node.flag("selected"),
                disabled: node.flag("disabled"), depth: Int(node.number("depth") ?? 0), expanded: expanded,
                align: node.string("align").flatMap(NRowAlign.init) ?? .center,
                actionsShown: node.string("actionsShown").flatMap(NRowActionsShown.init) ?? .hover,
                line: node.flag("line"), mark: node.flag("mark"), label: node.string("label"),
                pressable: node.flag("pressable"))
            self = .row(
                props, content: ResolvedNode.list(node.children),
                actions: node.slots?["actions"].map { ResolvedNode.list($0) })
        case "SettingRow":
            let matches = (node.list("titleMatches") ?? []).compactMap { pair -> Range<Int>? in
                guard case .list(let ends) = pair, ends.count == 2, let start = ends[0].numberValue,
                    let end = ends[1].numberValue
                else {
                    return nil
                }
                return Int(start)..<Int(max(start, end))
            }
            self = .settingRow(
                SettingRowProps(
                    title: node.string("title") ?? "", matches: matches, hint: node.string("hint") ?? "",
                    stacked: node.flag("stacked"), nested: node.flag("nested"), plain: node.flag("plain")),
                control: ResolvedNode.list(node.children))
        case "PopupRow":
            self = .popupRow(
                PopupRowProps(
                    label: node.string("label") ?? "",
                    variant: node.string("variant").flatMap(NPopupRowVariant.init) ?? .item,
                    icon: node.string("icon").flatMap(GMIconName.init), hint: node.string("hint") ?? "",
                    current: node.flag("current"), chevron: node.flag("chevron"),
                    highlighted: node.flag("highlighted"), disabled: node.flag("disabled")))
        case "SidebarRow":
            let expanded: Bool? = if case .bool(let open)? = node.props?["expanded"] { open } else { nil }
            self = .sidebarRow(
                SidebarRowProps(
                    label: node.string("label") ?? "",
                    depth: node.string("depth").flatMap(NSidebarRowDepth.init) ?? .none,
                    icon: node.string("icon").flatMap(GMIconName.init), current: node.flag("current"),
                    strong: node.flag("strong"), section: node.flag("section"), gone: node.flag("gone"),
                    selected: node.flag("selected"), expanded: expanded, count: node.number("count").map { Int($0) },
                    ahead: Int(node.number("ahead") ?? 0), behind: Int(node.number("behind") ?? 0),
                    path: node.string("path") ?? "", detail: node.string("detail") ?? "", title: node.string("title")),
                actions: node.slots?["actions"].map { ResolvedNode.list($0) })
        case "FileRow":
            let checked: Bool? = if case .bool(let on)? = node.props?["checked"] { on } else { nil }
            let actions = (node.list("actions") ?? []).compactMap { entry -> NFileRowAction? in
                guard let action = entry.record, let icon = action["icon"]?.text.flatMap(GMIconName.init) else {
                    return nil
                }
                let danger = if case .bool(true)? = action["danger"] { true } else { false }
                return NFileRowAction(icon: icon, title: action["title"]?.text ?? "", danger: danger) {}
            }
            self = .fileRow(
                FileRowProps(
                    kind: node.string("kind").flatMap(NStatusLetter.Kind.init), name: node.string("name") ?? "",
                    directory: node.string("directory") ?? "", note: node.string("note") ?? "",
                    badge: node.string("badge") ?? "", icon: node.object("icon").flatMap(ActionsNode.fileIconView),
                    selected: node.flag("selected"), nested: node.flag("nested"),
                    variant: node.string("variant").flatMap(NFileRowVariant.init) ?? .changes, checked: checked,
                    title: node.string("title"), actions: actions))
        case "ListRow":
            self = .listRow(
                label: node.string("label") ?? "", description: node.string("description") ?? "",
                icon: node.string("icon").flatMap(GMIconName.init), highlighted: node.flag("highlighted"),
                disabled: node.flag("disabled"), trailing: node.slots?["trailing"].map { ResolvedNode.list($0) })
        default:
            return nil
        }
    }
}

extension RowsNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @Erased
    var view: AnyView {
        switch self {
        case .settingRow(let props, let control):
            NSettingRow(
                title: props.title, titleMatches: props.matches, hint: props.hint, stacked: props.stacked,
                nested: props.nested, plain: props.plain
            ) {
                ScenarioChildren(nodes: control)
            }
        case .popupRow(let props):
            NPopupRow(
                label: props.label, variant: props.variant, icon: props.icon, hint: props.hint, current: props.current,
                chevron: props.chevron, highlighted: props.highlighted, disabled: props.disabled)
        case .sidebarRow(let props, let actions):
            if let actions {
                NSidebarRow(
                    label: props.label, depth: props.depth, icon: props.icon, current: props.current,
                    strong: props.strong, section: props.section, expanded: props.expanded, count: props.count,
                    ahead: props.ahead, behind: props.behind, path: props.path, detail: props.detail, gone: props.gone,
                    selected: props.selected, title: props.title
                ) {
                    ScenarioChildren(nodes: actions)
                }
            } else {
                NSidebarRow(
                    label: props.label, depth: props.depth, icon: props.icon, current: props.current,
                    strong: props.strong, section: props.section, expanded: props.expanded, count: props.count,
                    ahead: props.ahead, behind: props.behind, path: props.path, detail: props.detail, gone: props.gone,
                    selected: props.selected, title: props.title)
            }
        case .fileRow(let props):
            NFileRow(
                kind: props.kind, name: props.name, directory: props.directory, note: props.note, badge: props.badge,
                icon: props.icon, selected: props.selected, nested: props.nested, variant: props.variant,
                checked: props.checked.map { .constant($0) }, title: props.title, actions: props.actions)
        case .listRow(let label, let description, let icon, let highlighted, let disabled, let trailing):
            if let trailing {
                NListRow(
                    label: label, description: description, icon: icon, highlighted: highlighted, disabled: disabled
                ) {
                    ScenarioChildren(nodes: trailing)
                }
            } else {
                NListRow(
                    label: label, description: description, icon: icon, highlighted: highlighted, disabled: disabled)
            }
        case .row(let props, let content, let actions):
            if let actions {
                NRow(
                    size: props.size, selected: props.selected, disabled: props.disabled, depth: props.depth,
                    expanded: props.expanded, align: props.align, actionsShown: props.actionsShown, line: props.line,
                    mark: props.mark, label: props.label, action: props.pressable ? {} : nil
                ) {
                    ScenarioChildren(nodes: content)
                } actions: {
                    ScenarioChildren(nodes: actions)
                }
            } else {
                NRow(
                    size: props.size, selected: props.selected, disabled: props.disabled, depth: props.depth,
                    expanded: props.expanded, align: props.align, line: props.line, mark: props.mark,
                    label: props.label, action: props.pressable ? {} : nil
                ) {
                    ScenarioChildren(nodes: content)
                }
            }
        }
    }
}
