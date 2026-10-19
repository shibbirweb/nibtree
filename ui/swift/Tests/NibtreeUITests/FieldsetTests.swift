import AppKit
import SwiftUI
import Testing

@testable import NibtreeUI

/// Writes down whether the controls under it are enabled.
@MainActor
private final class EnabledProbe {
    static var seen: Bool?
}

private struct Probe: View {
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        EnabledProbe.seen = isEnabled
        return Color.clear.frame(width: 10, height: 10)
    }
}

@Suite("Fieldset")
@MainActor
struct FieldsetTests {
    private func enabled(inGroupDisabled disabled: Bool) -> Bool? {
        EnabledProbe.seen = nil
        let host = NSHostingView(rootView: NFieldset(legend: "Options", disabled: disabled) { Probe() })
        host.frame = CGRect(x: 0, y: 0, width: 200, height: 100)
        host.layoutSubtreeIfNeeded()
        return EnabledProbe.seen
    }

    @Test("a disabled group turns its controls off, like a disabled HTML fieldset")
    func disabledGroup() {
        #expect(enabled(inGroupDisabled: true) == false)
        #expect(enabled(inGroupDisabled: false) == true)
    }
}
