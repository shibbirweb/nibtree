import NibtreeUI
import SwiftUI

/// A scenario node with its props turned into the Swift twin's typed values once, before anything is drawn or timed,
/// the way ui/web hands a component its props object. Each component maps its ui/web prop names and values here.
indirect enum ResolvedNode: Sendable {
    case stack(StackProps, [ResolvedNode])
    case text(TextProps)
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
                (node.children ?? []).map(ResolvedNode.init))
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
            self = .unknown
        }
    }
}

/// Draws a resolved node with the Swift twin of the ui/web component it names; an unknown component draws nothing,
/// and the parity check fails on it.
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
        case .unknown:
            EmptyView()
        }
    }
}
