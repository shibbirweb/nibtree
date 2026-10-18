import SwiftUI

/// Takes the free room in a stack, so what comes after it sits at the far end: the Swift side of ui/web `Spacer`
/// (docs/components/Spacer.md). Use `NStack`'s `justify: .between` when a row has only two groups.
public struct NSpacer: View {
    public init() {}

    public var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .layoutValue(key: NStackGrows.self, value: true)
    }
}
