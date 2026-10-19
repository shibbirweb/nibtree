import NibtreeTokens
import SwiftUI

/// The named column widths of ui/web (`Grid`'s `minColumn`, `Pane`'s `width`), from the column width tokens.
public enum NColumnWidth: String, CaseIterable, Sendable {
    case small, medium, large, xlarge

    /// Points: small 140, medium 180, large 240, xlarge 320.
    public var points: CGFloat {
        switch self {
        case .small: GMColumnWidth.small
        case .medium: GMColumnWidth.medium
        case .large: GMColumnWidth.large
        case .xlarge: GMColumnWidth.xlarge
        }
    }
}
