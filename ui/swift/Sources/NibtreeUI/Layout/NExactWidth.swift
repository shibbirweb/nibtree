import SwiftUI

/// A view's exact width when SwiftUI would round it up: `NText` sets it to its typographic width, and `NStackLayout`
/// uses it, so text in a row sits where WebKit puts it (WebKit keeps fractions of a point).
public struct NExactWidth: LayoutValueKey {
    public static let defaultValue: CGFloat? = nil
}

/// Set on a stack with `grow`: the stack it sits in gives it the free length on its main axis, like `flex: 1 1 0`.
struct NStackGrows: LayoutValueKey {
    static let defaultValue = false
}
