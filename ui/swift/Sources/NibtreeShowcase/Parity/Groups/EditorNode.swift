import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Editor group's components, resolved from a scenario node.
enum EditorNode: Sendable {
    case mergeStackFrame(MergeStackFrameProps, resultEnd: [ResolvedNode])

    struct MergeStackFrameProps: Sendable {
        let label: String
        let labels: NMergeLabels
        let fileName: String
        let topHeight, ratio: Double
    }

    init?(_ node: ScenarioNode) {
        switch node.component {
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
                resultEnd: ResolvedNode.list(node.slots?["resultEnd"]))
        default:
            return nil
        }
    }
}

struct EditorView: View {
    let node: EditorNode

    var body: some View {
        switch node {
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
                ScenarioChildren(nodes: resultEnd)
            }
        }
    }
}
