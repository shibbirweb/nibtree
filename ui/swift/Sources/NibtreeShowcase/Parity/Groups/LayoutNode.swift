import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Layout group's components (but Stack, which `ScenarioView` draws itself), resolved from a scenario node.
enum LayoutNode: Sendable {
    case splitHandle(SplitHandleProps)
    case resizeHandle(ResizeHandleProps)
    case splitPane(SplitPaneProps, first: [ResolvedNode], second: [ResolvedNode]?)
    case divider(NDividerDirection, strong: Bool)
    case spacer

    struct SplitHandleProps: Sendable {
        let ratio, gutter, resetRatio: Double
        let label: String
    }

    struct ResizeHandleProps: Sendable {
        let size: Double
        let side: NPanelSide
        let preset: NPanelPreset
        let max: Double
        let min, defaultSize: Double?
        let label: String
        let inPanel: Bool
    }

    struct SplitPaneProps: Sendable {
        let direction: NSplitDirection
        let size: Double
        let sized: NSplitSized
        let preset: NPanelPreset
        let max: Double
        let label: String
        let extent: Double?
        let inPanel: Bool
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "SplitHandle":
            self = .splitHandle(
                SplitHandleProps(
                    ratio: node.number("ratio") ?? 0.5, gutter: node.number("gutter") ?? 0,
                    resetRatio: node.number("resetRatio") ?? 0.5, label: node.string("label") ?? ""))
        case "ResizeHandle":
            self = .resizeHandle(
                ResizeHandleProps(
                    size: node.number("size") ?? 0, side: node.string("side").flatMap(NPanelSide.init) ?? .left,
                    preset: node.string("preset").flatMap(NPanelPreset.init) ?? .pane, max: node.number("max") ?? 800,
                    min: node.number("min"), defaultSize: node.number("defaultSize"), label: node.string("label") ?? "",
                    inPanel: node.flag("inPanel")))
        case "SplitPane":
            let slots = node.slots ?? [:]
            self = .splitPane(
                SplitPaneProps(
                    direction: node.string("direction").flatMap(NSplitDirection.init) ?? .row,
                    size: node.number("size") ?? 0, sized: node.string("sized").flatMap(NSplitSized.init) ?? .first,
                    preset: node.string("preset").flatMap(NPanelPreset.init) ?? .pane, max: node.number("max") ?? 800,
                    label: node.string("label") ?? "", extent: node.number("extent"), inPanel: node.flag("inPanel")),
                first: ResolvedNode.list(slots["first"]),
                second: slots["second"].map { ResolvedNode.list($0) })
        case "Divider":
            self = .divider(
                node.string("direction").flatMap(NDividerDirection.init) ?? .horizontal,
                strong: node.flag("strong", default: true))
        case "Spacer":
            self = .spacer
        default:
            return nil
        }
    }
}

struct LayoutView: View {
    let node: LayoutNode

    var body: some View {
        switch node {
        case .splitHandle(let props):
            NSplitHandle(
                ratio: .constant(props.ratio), gutter: props.gutter, resetRatio: props.resetRatio, label: props.label)
        case .resizeHandle(let props):
            NResizeHandle(
                size: props.size, side: props.side, preset: props.preset, max: props.max, min: props.min,
                defaultSize: props.defaultSize, label: props.label, inPanel: props.inPanel, onresize: { _ in })
        case .splitPane(let props, let first, let second):
            if let second {
                NSplitPane(
                    direction: props.direction, size: .constant(props.size), sized: props.sized, preset: props.preset,
                    max: props.max, label: props.label, extent: props.extent.map { .constant($0) },
                    inPanel: props.inPanel
                ) {
                    ScenarioChildren(nodes: first)
                } second: {
                    ScenarioChildren(nodes: second)
                }
            } else {
                NSplitPane(
                    direction: props.direction, size: .constant(props.size), sized: props.sized, preset: props.preset,
                    max: props.max, label: props.label, inPanel: props.inPanel
                ) {
                    ScenarioChildren(nodes: first)
                }
            }
        case .divider(let direction, let strong):
            NDivider(direction: direction, strong: strong)
        case .spacer:
            NSpacer()
        }
    }
}
