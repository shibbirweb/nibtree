import NibtreeUI
import SwiftUI

/// Stories of the Forms group: controls that hold a value, each story with its own state to try.
extension Stories {
    static let forms: [Story] = [
        Story("Switch", group: "Forms") { SwitchStory() },
    ]
}

private struct SwitchStory: View {
    @State private var wrap = true
    @State private var minimap = false

    var body: some View {
        NStack(gap: .sm) {
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Wrap lines")
                NSwitch(checked: $wrap, label: "Wrap lines")
            }
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Show minimap")
                NSwitch(checked: $minimap, label: "Show minimap")
            }
            NStack(direction: .row, gap: .sm, align: .center, justify: .between) {
                NText("Locked", tone: .dim)
                NSwitch(checked: .constant(true), label: "Locked", disabled: true)
            }
        }
        .frame(width: 220)
    }
}
