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
