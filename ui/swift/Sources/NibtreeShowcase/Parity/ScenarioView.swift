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
    case forms(FormsNode)
    case navigation(NavigationNode)
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
            let props = TextProps(
                content: node.text ?? "",
                variant: node.string("variant").flatMap(NText.Variant.init(rawValue:)) ?? .body,
                tone: node.string("tone").flatMap(NText.Tone.init(rawValue:)),
                size: node.string("size").flatMap(NText.Size.init(rawValue:)),
                weight: node.string("weight").flatMap(NText.Weight.init(rawValue:)),
                mono: node.flag("mono"), truncate: node.flag("truncate"), selectable: node.flag("selectable"),
                tabular: node.flag("tabular"), strike: node.flag("strike"))
            // A Time in a Text takes the Text's style, as the web's inline span inherits it.
            if let child = node.children?.first, case .time(let time, _)? = LayoutNode(child) {
                self = .layout(.time(time, words: props))
            } else {
                self = .text(props)
            }
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
        } else if let forms = FormsNode(node) {
            self = .forms(forms)
        } else if let navigation = NavigationNode(node) {
            self = .navigation(navigation)
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

    var body: AnyView {
        Self.content(node)
    }

    /// The node's component in one `AnyView`, drawn straight into its parent.
    @Erased
    static func content(_ node: ResolvedNode) -> AnyView {
        switch node {
        case .stack(let props, let children):
            NStack(
                direction: props.direction, gap: props.gap, padding: props.padding, paddingX: props.paddingX,
                paddingY: props.paddingY, align: props.align, justify: props.justify, grow: props.grow,
                scroll: props.scroll, surface: props.surface, line: props.line
            ) {
                ScenarioChildren.content(children)
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
        case .forms(let inner):
            inner.view
        case .navigation(let inner):
            inner.view
        case .stated(let state, let inner):
            content(inner).environment(\.nibtreeForcedState, state)
        case .unknown:
            EmptyView()
        }
    }
}

/// A stack's or a slot's nodes, one after the other. Up to eight are written out like a static stack's children: a
/// `ForEach` costs every child its own subgraph (a row of eight Spacers drew in 100 ms through it, 85 ms written out).
struct ScenarioChildren: View {
    let nodes: [ResolvedNode]

    var body: AnyView {
        Self.content(nodes)
    }

    static func content(_ nodes: [ResolvedNode]) -> AnyView {
        let views = nodes.map(ScenarioView.content)
        switch views.count {
        case 0: return AnyView(EmptyView())
        case 1: return views[0]
        case 2: return AnyView(TupleView((views[0], views[1])))
        case 3: return AnyView(TupleView((views[0], views[1], views[2])))
        case 4: return AnyView(TupleView((views[0], views[1], views[2], views[3])))
        case 5: return AnyView(TupleView((views[0], views[1], views[2], views[3], views[4])))
        case 6: return AnyView(TupleView((views[0], views[1], views[2], views[3], views[4], views[5])))
        case 7: return AnyView(TupleView((views[0], views[1], views[2], views[3], views[4], views[5], views[6])))
        case 8:
            return AnyView(
                TupleView((views[0], views[1], views[2], views[3], views[4], views[5], views[6], views[7])))
        default: return AnyView(ForEach(Array(views.enumerated()), id: \.offset) { $0.element })
        }
    }
}

/// A switch whose every case is one `AnyView`. SwiftUI makes a `switch` one nested type of all its cases, and a node
/// pays for each level: a scenario's tree of switches (node kind, group, child count) cost a row of two checkboxes a
/// third of its time, a static row's code none. One `AnyView` per node costs a tenth of that.
@resultBuilder
enum Erased {
    static func buildExpression(_ view: some View) -> AnyView { AnyView(view) }
    static func buildExpression(_ view: AnyView) -> AnyView { view }
    static func buildBlock(_ view: AnyView) -> AnyView { view }
    static func buildEither(first view: AnyView) -> AnyView { view }
    static func buildEither(second view: AnyView) -> AnyView { view }
}
