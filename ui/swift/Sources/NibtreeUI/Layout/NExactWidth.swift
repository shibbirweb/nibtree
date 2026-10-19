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

/// A child's own cross-axis alignment in the stack it sits in, like CSS `align-self`: `NDivider` stretches across a
/// column and centers in a row whatever the stack's `align`.
struct NStackAlignSelf: LayoutValueKey {
    static let defaultValue: NStackAlign? = nil
}

/// Room a child keeps before itself on the stack's main axis, like a CSS margin: `first` when it is the stack's first
/// child (`:first-child`), `other` after another. SectionTitle's `group` keeps more room above all but the first.
struct NStackMargin: LayoutValueKey, Equatable {
    static let defaultValue: NStackMargin? = nil

    let first: CGFloat
    let other: CGFloat
}
