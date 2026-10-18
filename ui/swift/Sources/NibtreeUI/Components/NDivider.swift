import NibtreeTokens
import SwiftUI

public enum NDividerDirection: String, CaseIterable, Sendable { case horizontal, vertical }

/// A 1 point line between groups: the Swift side of ui/web `Divider` (docs/components/Divider.md). Horizontal by
/// default, across the whole stack it sits in; vertical in toolbars, centered, as long as the toolbar's divider.
/// `hideAt` (hidden in a narrow Toolbar or Stack) follows with the responsive Toolbar. VoiceOver skips it, as macOS
/// does its separators (the web gives it `role="separator"`).
public struct NDivider: View {
    private let direction: NDividerDirection
    private let strong: Bool
    @Environment(\.nibtreePalette) private var palette
    @Environment(\.nibtreeDividerMetrics) private var metrics

    public init(direction: NDividerDirection = .horizontal, strong: Bool = true) {
        self.direction = direction
        self.strong = strong
    }

    public var body: some View {
        let line = palette.color(strong ? .borderStrong : .border)
        switch direction {
        case .horizontal:
            // No width of its own (nothing in a row, like the web's empty block); a stack stretches it across.
            line.frame(minWidth: 0, idealWidth: 0, maxWidth: .infinity).frame(height: 1)
                .accessibilityHidden(true)
                .layoutValue(key: NStackAlignSelf.self, value: .stretch)
        case .vertical:
            line.frame(width: 1, height: metrics.length).padding(.horizontal, metrics.space)
                .accessibilityHidden(true)
                .layoutValue(key: NStackAlignSelf.self, value: .center)
        }
    }
}
