import NibtreeTokens
import SwiftUI

/// The space steps of `gap` and `padding` in ui/web (`Stack`, `Toolbar`...): the same names, from the space tokens,
/// so a token change moves every gap on both platforms.
public enum NSpacing: String, CaseIterable, Sendable {
    case none, xxs, xs, sm, md, mdPlus, lg, lgPlus, xl, xxl, xxxl

    /// Points: xxs 2, xs 4, sm 6, md 8, mdPlus 10, lg 12, lgPlus 14, xl 16, xxl 24, xxxl 32.
    public var points: CGFloat {
        switch self {
        case .none: 0
        case .xxs: GMSpace.s1
        case .xs: GMSpace.s2
        case .sm: GMSpace.s3
        case .md: GMSpace.s4
        case .mdPlus: GMSpace.s5
        case .lg: GMSpace.s6
        case .lgPlus: GMSpace.s7
        case .xl: GMSpace.s8
        case .xxl: GMSpace.s11
        case .xxxl: GMSpace.s12
        }
    }
}
