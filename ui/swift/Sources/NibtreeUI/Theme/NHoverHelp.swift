import SwiftUI

/// A tooltip made only while the pointer is over the view: a `.help` on every mark of a row cost the row a third of
/// its time, a hover watch about half that.
struct NHoverHelp: ViewModifier {
    let text: String
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .onHover { hovering = $0 }
            .overlay {
                if hovering {
                    Color.clear.help(text)
                }
            }
    }
}
