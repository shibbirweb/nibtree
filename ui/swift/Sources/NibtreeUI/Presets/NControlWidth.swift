import NibtreeTokens
import SwiftUI

/// The named widths of ui/web controls (`Input`'s and `Select`'s `width`): `auto` (the control's own), `fill` (the
/// parent's) or a control width token.
public enum NControlWidth: String, CaseIterable, Sendable {
    case auto, fill, xsmall, number, small, medium, large

    /// Points for the token widths: xsmall 80, number 110, small 120, medium 180, large 280; nil for auto and fill.
    public var points: CGFloat? {
        switch self {
        case .auto, .fill: nil
        case .xsmall: GMControlWidth.xsmall
        case .number: GMControlWidth.number
        case .small: GMControlWidth.small
        case .medium: GMControlWidth.medium
        case .large: GMControlWidth.large
        }
    }
}
