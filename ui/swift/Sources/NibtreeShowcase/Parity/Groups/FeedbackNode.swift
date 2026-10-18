import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The Feedback group's components, resolved from a scenario node.
enum FeedbackNode: Sendable {
    case kbd(keys: String)
    case mark(text: String, size: NMark.Size)
    /// The web's `title` is `.help` in SwiftUI; a separate case keeps untitled marks free of it.
    case titledMark(text: String, size: NMark.Size, title: String)
    case progressBar(value: Double, label: String, tone: NProgressBar.Tone)
    case spinner(label: String, size: NSpinner.Size, delayed: Bool)
    case statusDot(tone: NStatusDot.Tone, pulse: Bool, size: NStatusDot.Size, label: String?)

    init?(_ node: ScenarioNode) {
        switch node.component {
        case "Kbd":
            self = .kbd(keys: node.string("keys") ?? "")
        case "Mark":
            let (text, size) = (node.string("text") ?? "", node.string("size").flatMap(NMark.Size.init) ?? .normal)
            if let title = node.string("title") {
                self = .titledMark(text: text, size: size, title: title)
            } else {
                self = .mark(text: text, size: size)
            }
        case "ProgressBar":
            self = .progressBar(
                value: node.number("value") ?? 0, label: node.string("label") ?? "",
                tone: node.string("tone").flatMap(NProgressBar.Tone.init) ?? .accent)
        case "Spinner":
            self = .spinner(
                label: node.string("label") ?? "Loading",
                size: node.string("size").flatMap(NSpinner.Size.init) ?? .normal, delayed: node.flag("delayed"))
        case "StatusDot":
            self = .statusDot(
                tone: node.string("tone").flatMap(NStatusDot.Tone.init) ?? .neutral, pulse: node.flag("pulse"),
                size: node.string("size").flatMap(NStatusDot.Size.init) ?? .normal, label: node.string("label"))
        default:
            return nil
        }
    }
}

extension FeedbackNode {
    /// The component, drawn straight into `ScenarioView`'s switch: a view of its own would cost every child a node.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .kbd(let keys):
            NKbd(keys: keys)
        case .mark(let text, let size):
            NMark(text: text, size: size)
        case .titledMark(let text, let size, let title):
            NMark(text: text, size: size).help(title)
        case .progressBar(let value, let label, let tone):
            NProgressBar(value: value, label: label, tone: tone)
        case .spinner(let label, let size, let delayed):
            NSpinner(label: label, size: size, delayed: delayed)
        case .statusDot(let tone, let pulse, let size, let label):
            NStatusDot(tone: tone, pulse: pulse, size: size, label: label)
        }
    }
}
