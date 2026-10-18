import NibtreeTokens
import SwiftUI

private struct StillKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Draws animations at rest, like Playwright's screenshots with `animations: "disabled"`: an endless one (a
    /// spinner's turn) at its start, one that ends (a fade in) at its end. The parity pictures set it; false in use.
    public var nibtreeStill: Bool {
        get { self[StillKey.self] }
        set { self[StillKey.self] = newValue }
    }
}

extension View {
    /// Fades the view to 0.3 and back each second, eased both ways, like a running StatusDot's `pulse` on the web; at
    /// rest under `nibtreeStill`. Only views that pulse carry it, so still ones pay nothing.
    public func nibtreePulse() -> some View {
        modifier(NPulse())
    }
}

private struct NPulse: ViewModifier {
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    func body(content: Content) -> some View {
        content
            .opacity(started && !still ? 0.3 : 1)
            .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: started)
            .onAppear { started = true }
    }
}

/// Fades the view in after a moment, like the web's `appear` animation on a `delayed` view, so quick work does not
/// flash it; shown at once under `nibtreeStill`.
struct NDelayedAppear: ViewModifier {
    @State private var started = false
    @Environment(\.nibtreeStill) private var still

    func body(content: Content) -> some View {
        content
            .opacity(started || still ? 1 : 0)
            .animation(NSpinner.ease.delay(GMMotion.appearDelay), value: started)
            .onAppear { started = true }
    }
}
