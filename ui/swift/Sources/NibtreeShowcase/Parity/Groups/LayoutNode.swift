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
    case treeLine(NTreeLine.Position)
    /// A Time; `words` is the Text it sits in, whose style its words take.
    case time(TimeProps, words: ResolvedNode.TextProps?)
    case card(CardProps, children: [ResolvedNode])
    case grid(GridProps, children: [ResolvedNode])
    case pane(PaneProps, children: [ResolvedNode])
    case panelHeader(title: String, count: Int?, actions: [ResolvedNode]?)
    /// `values` is the `value` slot drawn for each item (its `$value` text replaced), by label.
    case descriptionList(items: [NDescriptionItem], label: String?, values: [String: [ResolvedNode]]?)

    struct PaneProps: Sendable {
        let label: String
        let width: NColumnWidth
        let side: NPaneSide
        let line: NPaneLine
    }

    struct GridProps: Sendable {
        let columns: NGridColumns
        let minColumn: NColumnWidth
        let gap: NSpacing
        let label: String?
    }

    struct TimeProps: Sendable {
        let time: Date
        let format: NTimeFormat
        let live: Bool
    }

    struct CardProps: Sendable {
        let label: String?
        let padded, selected, dim: Bool
    }

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
        case "Time":
            self = .time(
                TimeProps(
                    time: Date(timeIntervalSince1970: (node.number("time") ?? 0) / 1000),
                    format: node.string("format").flatMap(NTimeFormat.init) ?? .ago,
                    live: node.flag("live", default: true)),
                words: nil)
        case "TreeLine":
            self = .treeLine(node.string("position").flatMap(NTreeLine.Position.init) ?? .middle)
        case "Grid":
            self = .grid(
                GridProps(
                    columns: node.string("columns").flatMap(NGridColumns.init) ?? .auto,
                    minColumn: node.string("minColumn").flatMap(NColumnWidth.init) ?? .medium,
                    gap: node.string("gap").flatMap(NSpacing.init) ?? .lg, label: node.string("label")),
                children: ResolvedNode.list(node.children))
        case "DescriptionList":
            let items = (node.list("items") ?? []).compactMap { entry -> NDescriptionItem? in
                guard let item = entry.record else {
                    return nil
                }
                let mono = if case .bool(true)? = item["mono"] { true } else { false }
                return NDescriptionItem(
                    label: item["label"]?.text ?? "", value: item["value"]?.text ?? "", mono: mono)
            }
            let values = node.slots?["value"].map { template in
                Dictionary(
                    items.map { item in
                        (item.label, ResolvedNode.list(template.map { $0.replacing("$value", with: item.value) }))
                    }, uniquingKeysWith: { first, _ in first })
            }
            self = .descriptionList(items: items, label: node.string("label"), values: values)
        case "PanelHeader":
            self = .panelHeader(
                title: node.string("title") ?? "", count: node.number("count").map { Int($0) },
                actions: node.slots?["actions"].map { ResolvedNode.list($0) })
        case "Pane":
            self = .pane(
                PaneProps(
                    label: node.string("label") ?? "", width: node.string("width").flatMap(NColumnWidth.init) ?? .large,
                    side: node.string("side").flatMap(NPaneSide.init) ?? .left,
                    line: node.string("line").flatMap(NPaneLine.init) ?? .strong),
                children: ResolvedNode.list(node.children))
        case "Card":
            self = .card(
                CardProps(
                    label: node.string("label"), padded: node.flag("padded"), selected: node.flag("selected"),
                    dim: node.flag("dim")),
                children: ResolvedNode.list(node.children))
        default:
            return nil
        }
    }
}

extension LayoutNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @Erased
    var view: AnyView {
        switch self {
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
        case .treeLine(let position):
            NTreeLine(position: position)
        case .time(let props, let words):
            if let words {
                NTime(time: props.time, format: props.format, live: props.live) {
                    NText(
                        $0, variant: words.variant, tone: words.tone, size: words.size, weight: words.weight,
                        mono: words.mono, truncate: words.truncate, tabular: true, strike: words.strike)
                }
            } else {
                NTime(time: props.time, format: props.format, live: props.live)
            }
        case .grid(let props, let children):
            NGrid(columns: props.columns, minColumn: props.minColumn, gap: props.gap, label: props.label) {
                ScenarioChildren(nodes: children)
            }
        case .descriptionList(let items, let label, let values):
            if let values {
                NDescriptionList(items: items, label: label) { item in
                    ScenarioChildren(nodes: values[item.label] ?? [])
                }
            } else {
                NDescriptionList(items: items, label: label)
            }
        case .panelHeader(let title, let count, let actions):
            if let actions {
                NPanelHeader(title: title, count: count) { ScenarioChildren(nodes: actions) }
            } else {
                NPanelHeader(title: title, count: count)
            }
        case .pane(let props, let children):
            NPane(label: props.label, width: props.width, side: props.side, line: props.line) {
                ScenarioChildren(nodes: children)
            }
        case .card(let props, let children):
            NCard(label: props.label, padded: props.padded, selected: props.selected, dim: props.dim) {
                ScenarioChildren(nodes: children)
            }
        }
    }
}
