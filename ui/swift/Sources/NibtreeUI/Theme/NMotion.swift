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
