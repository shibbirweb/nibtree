import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Editor group's components, resolved from a scenario node.
enum EditorNode: Sendable {
    case mergeStackFrame(MergeStackFrameProps, resultEnd: [ResolvedNode])
    case highlightText(text: String, ranges: [Range<Int>], variant: NHighlightTextVariant)
    case zoomBar(zoom: Double?, fitted: Double, disabled: Bool, fitTitle: String?, actualTitle: String?)

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
        case "ZoomBar":
            self = .zoomBar(
                zoom: node.number("zoom"), fitted: node.number("fitted") ?? 1, disabled: node.flag("disabled"),
                fitTitle: node.string("fitTitle"), actualTitle: node.string("actualTitle"))
        case "HighlightText":
            // The web's [start, end] pairs; a backwards pair matches nothing, as on the web.
            let ranges = (node.list("ranges") ?? []).compactMap { pair -> Range<Int>? in
                guard case .list(let ends) = pair, ends.count == 2, let start = ends[0].numberValue,
                    let end = ends[1].numberValue
                else {
                    return nil
                }
                return Int(start)..<Int(max(start, end))
            }
            self = .highlightText(
                text: node.string("text") ?? "", ranges: ranges,
                variant: node.string("variant").flatMap(NHighlightTextVariant.init) ?? .strong)
        default:
            return nil
        }
    }
}

extension EditorNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @Erased
    var view: AnyView {
        switch self {
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
        case .zoomBar(let zoom, let fitted, let disabled, let fitTitle, let actualTitle):
            NZoomBar(
                zoom: .constant(zoom), fitted: fitted, disabled: disabled,
                fitTitle: fitTitle ?? "Fit the image in the view",
                actualTitle: actualTitle ?? "Show the image at its real size")
        case .highlightText(let text, let ranges, let variant):
            NHighlightText(text: text, ranges: ranges, variant: variant)
        }
    }
}
