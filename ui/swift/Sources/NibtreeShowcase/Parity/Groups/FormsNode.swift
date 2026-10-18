import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Forms group's components, resolved from a scenario node. A control's value is the scenario's (`.constant`).
enum FormsNode: Sendable {
    case toggle(checked: Bool, label: String, disabled: Bool)

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Switch":
            self = .toggle(
                checked: node.flag("checked"), label: node.string("label") ?? "", disabled: node.flag("disabled"))
        default:
            return nil
        }
    }
}

extension FormsNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .toggle(let checked, let label, let disabled):
            NSwitch(checked: .constant(checked), label: label, disabled: disabled)
        }
    }
}
