import NibtreeTokens
import SwiftUI

/// A vertical divider's length and the room on its sides, set by the bar it stands in (the web's `--divider-length`
/// and `--divider-space`): a plain toolbar's length and no room by default.
struct NDividerMetrics: Sendable {
    var length: CGFloat = GMToolbarTokens.dividerLength
    var space: CGFloat = 0
}

private struct NDividerMetricsKey: EnvironmentKey {
    static let defaultValue = NDividerMetrics()
}

extension EnvironmentValues {
    var nibtreeDividerMetrics: NDividerMetrics {
        get { self[NDividerMetricsKey.self] }
        set { self[NDividerMetricsKey.self] = newValue }
    }
}
