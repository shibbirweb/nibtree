import NibtreeTokens
import NibtreeUI
import SwiftUI

/// Every component but Stack and Text, one level below `ScenarioView`. SwiftUI makes one nested view type of all a
/// switch's cases, and every node pays for its depth: Stack and Text, which every scenario is built from, stay in a
/// short switch, and the rest sit behind this view (split it by group as the library grows).
struct ComponentNode: View {
    let node: ResolvedNode

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
                    ScenarioList(nodes: first)
                } second: {
                    ScenarioList(nodes: second)
                }
            } else {
                NSplitPane(
                    direction: props.direction, size: .constant(props.size), sized: props.sized, preset: props.preset,
                    max: props.max, label: props.label, inPanel: props.inPanel
                ) {
                    ScenarioList(nodes: first)
                }
            }
        case .mergeStackFrame(let props, let resultEnd):
            NMergeStackFrame(
                label: props.label, labels: props.labels, fileName: props.fileName,
                topHeight: .constant(props.topHeight), ratio: .constant(props.ratio)
            ) {
                EmptyView()
            } result: {
                EmptyView()
            } right: {
                EmptyView()
            } resultEnd: {
                ScenarioList(nodes: resultEnd)
            }
        case .divider(let direction, let strong):
            NDivider(direction: direction, strong: strong)
        case .spacer:
            NSpacer()
        case .icon(let name, let size, let stroke, let tone):
            NIcon(name, size: size, stroke: stroke, tone: tone)
        case .stated(let state, let inner):
            ScenarioView(node: inner).environment(\.nibtreeForcedState, state)
        default:
            EmptyView()
        }
    }
}
