import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Feedback group's components, resolved from a scenario node.
enum FeedbackNode: Sendable {
    case kbd(keys: String)

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Kbd":
            self = .kbd(keys: node.string("keys") ?? "")
        default:
            return nil
        }
    }
}

struct FeedbackView: View {
    let node: FeedbackNode

    var body: some View {
        switch node {
        case .kbd(let keys):
            NKbd(keys: keys)
        }
    }
}
