import NibtreeTokens
import SwiftUI

/// The named widths of a form's label column (`RadioGroup`'s `labelWidth`), from the label column tokens.
public enum NLabelColumn: String, CaseIterable, Sendable {
    case small, medium, large

    /// Points: small 100, medium 120, large 130.
    public var points: CGFloat {
        switch self {
        case .small: GMLabelColumn.small
        case .medium: GMLabelColumn.medium
        case .large: GMLabelColumn.large
        }
    }
}
