import NibtreeTokens
import SwiftUI

/// Icon sizes of ui/web `Icon` (`size`), the same names, from the icon size tokens.
public enum NIconSize: String, CaseIterable, Sendable {
    case xxsmall, xsmall, small, compact, medium, normal, regular, large, xlarge, activity, xxlarge, emphasis, huge
    case logo, giant, display

    /// Points: 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 24, 26, 28, 34.
    public var points: CGFloat {
        switch self {
        case .xxsmall: GMIconSize.xxsmall
        case .xsmall: GMIconSize.xsmall
        case .small: GMIconSize.small
        case .compact: GMIconSize.compact
        case .medium: GMIconSize.medium
        case .normal: GMIconSize.normal
        case .regular: GMIconSize.regular
        case .large: GMIconSize.large
        case .xlarge: GMIconSize.xlarge
        case .activity: GMIconSize.activity
        case .xxlarge: GMIconSize.xxlarge
        case .emphasis: GMIconSize.emphasis
        case .huge: GMIconSize.huge
        case .logo: GMIconSize.logo
        case .giant: GMIconSize.giant
        case .display: GMIconSize.display
        }
    }
}

/// Icon line weights of ui/web `Icon` (`stroke`), on the icon's 24-point grid; `heavy` is only for the dotted
/// "more" icon, which takes it itself.
public enum NIconStroke: String, CaseIterable, Sendable {
    case thin, light, normal, bold

    public var width: CGFloat {
        switch self {
        case .thin: GMIconStroke.thin
        case .light: GMIconStroke.light
        case .normal: GMIconStroke.normal
        case .bold: GMIconStroke.bold
        }
    }
}
