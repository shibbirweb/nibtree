import NibtreeTokens
import NibtreeUI
import SwiftUI

/// Stories of the Feedback group: badges, marks, progress and the like.
extension Stories {
    static let feedback: [Story] = [
        Story("Kbd", group: "Feedback") {
            NStack(gap: .sm) {
                NStack(direction: .row, gap: .sm, align: .center) {
                    NKbd(keys: "⌘P")
                    NKbd(keys: "⇧⌘F")
                    NKbd(keys: "Esc")
                    NText("Quick open", tone: .dim)
                }
                NKbd(keys: "⌘K ⌘S")
            }
        },
    ]
}
