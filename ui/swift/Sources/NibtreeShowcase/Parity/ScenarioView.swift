import NibtreeTokens
import NibtreeUI
import SwiftUI

/// A scenario node with its props turned into the Swift twin's typed values once, before anything is drawn or timed,
/// the way ui/web hands a component its props object. Each component maps its ui/web prop names and values here.
indirect enum ResolvedNode: Sendable {
    case stack(StackProps, [ResolvedNode])
    case text(TextProps)
    case layout(LayoutNode)
    case actions(ActionsNode)
    case feedback(FeedbackNode)
    case editor(EditorNode)
    /// A node with a forced interaction state: its own node, drawn with `nibtreeForcedState` set.
    case stated(NInteractionState, ResolvedNode)
    case unknown

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
                ResolvedNode.list(node.children))
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
        default:
            self = ResolvedNode(group: node)
        }
    }

    /// The node as one of the library groups' components (Parity/Groups), or `.unknown`.
    private init(group node: ScenarioNode) {
        if let layout = LayoutNode(node) {
            self = .layout(layout)
        } else if let actions = ActionsNode(node) {
            self = .actions(actions)
        } else if let feedback = FeedbackNode(node) {
            self = .feedback(feedback)
        } else if let editor = EditorNode(node) {
            self = .editor(editor)
        } else {
            self = .unknown
        }
    }

    /// A slot's or a stack's children, resolved.
    static func list(_ nodes: [ScenarioNode]?) -> [ResolvedNode] {
        (nodes ?? []).map { ResolvedNode($0) }
    }
}

/// Draws a resolved node with the Swift twin of the ui/web component it names; an unknown component draws nothing,
/// and the parity check fails on it. Each library group draws its own components (Parity/Groups).
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
                ScenarioChildren(nodes: children)
            }
        case .text(let props):
            NText(
                props.content, variant: props.variant, tone: props.tone, size: props.size, weight: props.weight,
                mono: props.mono, truncate: props.truncate, selectable: props.selectable, tabular: props.tabular,
                strike: props.strike)
        case .layout(let inner):
            inner.view
        case .actions(let inner):
            inner.view
        case .feedback(let inner):
            inner.view
        case .editor(let inner):
            inner.view
        case .stated(let state, let inner):
            ScenarioView(node: inner).environment(\.nibtreeForcedState, state)
        case .unknown:
            EmptyView()
        }
    }
}

/// A stack's or a slot's nodes, one after the other. Up to eight are written out like a static stack's children: a
/// `ForEach` costs every child its own subgraph (a row of eight Spacers drew in 100 ms through it, 85 ms written out).
struct ScenarioChildren: View {
    let nodes: [ResolvedNode]

    var body: some View {
        switch nodes.count {
        case 1:
            ScenarioView(node: nodes[0])
        case 2:
            node(0); node(1)
        case 3:
            node(0); node(1); node(2)
        case 4:
            node(0); node(1); node(2); node(3)
        case 5:
            node(0); node(1); node(2); node(3); node(4)
        case 6:
            node(0); node(1); node(2); node(3); node(4); node(5)
        case 7:
            node(0); node(1); node(2); node(3); node(4); node(5); node(6)
        case 8:
            node(0); node(1); node(2); node(3); node(4); node(5); node(6); node(7)
        default:
            ForEach(Array(nodes.enumerated()), id: \.offset) { _, child in
                ScenarioView(node: child)
            }
        }
    }

    private func node(_ index: Int) -> ScenarioView {
        ScenarioView(node: nodes[index])
    }
}
