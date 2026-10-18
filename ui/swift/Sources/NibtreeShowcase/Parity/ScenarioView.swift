import NibtreeTokens
import NibtreeUI
import SwiftUI

/// A scenario node with its props turned into the Swift twin's typed values once, before anything is drawn or timed,
/// the way ui/web hands a component its props object. Each component maps its ui/web prop names and values here.
indirect enum ResolvedNode: Sendable {
    case stack(StackProps, [ResolvedNode])
    case text(TextProps)
    case splitHandle(SplitHandleProps)
    case resizeHandle(ResizeHandleProps)
    case splitPane(SplitPaneProps, first: [ResolvedNode], second: [ResolvedNode]?)
    case mergeStackFrame(MergeStackFrameProps, resultEnd: [ResolvedNode])
    case divider(NDividerDirection, strong: Bool)
    case spacer
    case icon(GMIconName, NIconSize, NIconStroke, NText.Tone?)
    /// A node with a forced interaction state: its own node, drawn with `nibtreeForcedState` set.
    case stated(NInteractionState, ResolvedNode)
    case unknown

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

    struct MergeStackFrameProps: Sendable {
        let label: String
        let labels: NMergeLabels
        let fileName: String
        let topHeight, ratio: Double
    }

    struct StackProps: Sendable {
        let direction: NStackDirection
        let gap: NSpacing
        let padding: NSpacing
        let paddingX: NSpacing?
        let paddingY: NSpacing?
        let align: NStackAlign
        let justify: NStackJustify
        let grow: Bool
        let scroll: NStackScroll
        let surface: NStackSurface
        let line: NStackLine
    }

    struct TextProps: Sendable {
        let content: String
        let variant: NText.Variant
        let tone: NText.Tone?
        let size: NText.Size?
        let weight: NText.Weight?
        let mono, truncate, selectable, tabular, strike: Bool
    }

    init(_ node: ScenarioNode) {
        let plain = ResolvedNode(plain: node)
        if let state = node.state.flatMap(NInteractionState.init(rawValue:)) {
            self = .stated(state, plain)
        } else {
            self = plain
        }
    }

    private init(plain node: ScenarioNode) {
        switch node.component {
        case "Stack":
            self = .stack(
                StackProps(
                    direction: node.string("direction").flatMap(NStackDirection.init(rawValue:)) ?? .column,
                    gap: node.string("gap").flatMap(NSpacing.init(rawValue:)) ?? .md,
                    padding: node.string("padding").flatMap(NSpacing.init(rawValue:)) ?? .none,
                    paddingX: node.string("paddingX").flatMap(NSpacing.init(rawValue:)),
                    paddingY: node.string("paddingY").flatMap(NSpacing.init(rawValue:)),
                    align: node.string("align").flatMap(NStackAlign.init(rawValue:)) ?? .stretch,
                    justify: node.string("justify").flatMap(NStackJustify.init(rawValue:)) ?? .start,
                    grow: node.flag("grow"),
                    scroll: node.string("scroll").flatMap(NStackScroll.init(rawValue:)) ?? .none,
                    surface: node.string("surface").flatMap(NStackSurface.init(rawValue:)) ?? .none,
                    line: node.string("line").flatMap(NStackLine.init(rawValue:)) ?? .none),
                (node.children ?? []).map { ResolvedNode($0) })
        case "Text":
            self = .text(
                TextProps(
                    content: node.text ?? "",
                    variant: node.string("variant").flatMap(NText.Variant.init(rawValue:)) ?? .body,
                    tone: node.string("tone").flatMap(NText.Tone.init(rawValue:)),
                    size: node.string("size").flatMap(NText.Size.init(rawValue:)),
                    weight: node.string("weight").flatMap(NText.Weight.init(rawValue:)),
                    mono: node.flag("mono"), truncate: node.flag("truncate"), selectable: node.flag("selectable"),
                    tabular: node.flag("tabular"), strike: node.flag("strike")))
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
                first: (slots["first"] ?? []).map { ResolvedNode($0) },
                second: slots["second"].map { $0.map { ResolvedNode($0) } })
        case "MergeStackFrame":
            let labels = node.object("labels")
            self = .mergeStackFrame(
                MergeStackFrameProps(
                    label: node.string("label") ?? "",
                    labels: NMergeLabels(
                        left: labels?["left"] ?? "Yours", result: labels?["result"] ?? "Result",
                        right: labels?["right"] ?? "Theirs"),
                    fileName: node.string("fileName") ?? "", topHeight: node.number("topHeight") ?? 0,
                    ratio: node.number("ratio") ?? 0.5),
                resultEnd: (node.slots?["resultEnd"] ?? []).map { ResolvedNode($0) })
        case "Divider":
            self = .divider(
                node.string("direction").flatMap(NDividerDirection.init) ?? .horizontal,
                strong: node.flag("strong", default: true))
        case "Spacer":
            self = .spacer
        case "Icon":
            guard let name = node.string("name").flatMap(GMIconName.init) else {
                self = .unknown
                return
            }
            self = .icon(
                name, node.string("size").flatMap(NIconSize.init) ?? .large,
                node.string("stroke").flatMap(NIconStroke.init) ?? .normal,
                node.string("tone").flatMap(NText.Tone.init))
        default:
            self = .unknown
        }
    }
}

/// Draws a resolved node with the Swift twin of the ui/web component it names; an unknown component draws nothing,
/// and the parity check fails on it. Stack and Text are drawn here, everything else by `ComponentNode`.
struct ScenarioView: View {
    let node: ResolvedNode

    var body: some View {
        switch node {
        case .stack(let props, let children):
            NStack(
                direction: props.direction, gap: props.gap, padding: props.padding, paddingX: props.paddingX,
                paddingY: props.paddingY, align: props.align, justify: props.justify, grow: props.grow,
                scroll: props.scroll, surface: props.surface, line: props.line
            ) {
                ForEach(Array(children.enumerated()), id: \.offset) { _, child in
                    ScenarioView(node: child)
                }
            }
        case .text(let props):
            NText(
                props.content, variant: props.variant, tone: props.tone, size: props.size, weight: props.weight,
                mono: props.mono, truncate: props.truncate, selectable: props.selectable, tabular: props.tabular,
                strike: props.strike)
        default:
            ComponentNode(node: node)
        }
    }
}

/// A slot's nodes, one after the other, like the web's snippet content in a column.
struct ScenarioList: View {
    let nodes: [ResolvedNode]

    var body: some View {
        // One child (the usual slot) is shown as it is: a ForEach would add views the web's snippet does not have.
        if nodes.count == 1 {
            ScenarioView(node: nodes[0])
        } else {
            ForEach(Array(nodes.enumerated()), id: \.offset) { _, child in
                ScenarioView(node: child)
            }
        }
    }
}
