import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Actions group's components, resolved from a scenario node.
enum ActionsNode: Sendable {
    case icon(GMIconName, NIconSize, NIconStroke, NText.Tone?)
    case layoutIcon(NLayoutIcon.Kind, active: Bool, NIconSize)

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Icon":
            guard let name = node.string("name").flatMap(GMIconName.init) else {
                return nil
            }
            self = .icon(
                name, node.string("size").flatMap(NIconSize.init) ?? .large,
                node.string("stroke").flatMap(NIconStroke.init) ?? .normal,
                node.string("tone").flatMap(NText.Tone.init))
        case "LayoutIcon":
            guard let kind = node.string("kind").flatMap(NLayoutIcon.Kind.init) else {
                return nil
            }
            self = .layoutIcon(kind, active: node.flag("active"), node.string("size").flatMap(NIconSize.init) ?? .large)
        default:
            return nil
        }
    }
}

extension ActionsNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .icon(let name, let size, let stroke, let tone):
            NIcon(name, size: size, stroke: stroke, tone: tone)
        case .layoutIcon(let kind, let active, let size):
            NLayoutIcon(kind: kind, active: active, size: size)
        }
    }
}
