import SwiftUI

/// An interaction state drawn without the pointer or the keyboard: the Swift side of ui/web `logic/forcedState.ts`.
/// The parity scenarios and the compare tool force it (`state` on a scenario node) so both libraries can be compared
/// hovered or dragged; components list the states they draw in their ui/web doc (`states`).
public enum NInteractionState: String, CaseIterable, Sendable {
    case hover, pressed, focus, dragging
}

private struct ForcedStateKey: EnvironmentKey {
    static let defaultValue: NInteractionState? = nil
}

extension EnvironmentValues {
    /// The state every component below draws, whatever the pointer does; nil in normal use.
    public var nibtreeForcedState: NInteractionState? {
        get { self[ForcedStateKey.self] }
        set { self[ForcedStateKey.self] = newValue }
    }
}

extension NInteractionState? {
    /// Pointed at or dragged, which handles draw the same way.
    var showsHandle: Bool { self == .hover || self == .dragging }
}
