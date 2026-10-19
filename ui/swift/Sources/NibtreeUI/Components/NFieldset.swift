import NibtreeTokens
import SwiftUI

/// A legend's color: `faint`, or `dim` in a small form like Commit Options' GPG sign.
public enum NFieldsetLegendTone: String, CaseIterable, Sendable {
    case faint, dim
}

/// A group of options under a legend, like Pull's "Integrate the incoming changes with" and its choices: the Swift
/// side of ui/web `Fieldset` (docs/components/Fieldset.md). The children stack as a column under the legend, each as
/// wide as the group; `disabled` fades the group and turns its controls off, like a disabled HTML fieldset.
public struct NFieldset<Content: View>: View {
    /// Fieldset.svelte's `:disabled` opacity: the web library writes its opacities in the component.
    static var disabledOpacity: Double { 0.55 }

    private let legend: String
    private let disabled: Bool
    private let legendTone: NFieldsetLegendTone
    private let content: Content

    public init(
        legend: String, disabled: Bool = false, legendTone: NFieldsetLegendTone = .faint,
        @ViewBuilder content: () -> Content
    ) {
        self.legend = legend
        self.disabled = disabled
        self.legendTone = legendTone
        self.content = content()
    }

    public var body: some View {
        // The legend is not one of the group's flex items: only its own margin parts it from the first child.
        NStackLayout(axis: .vertical, spacing: 0, align: .stretch, justify: .start) {
            NText(legend, tone: legendTone == .dim ? .dim : .faint, size: .small)
            NStackLayout(
                axis: .vertical, spacing: GMFieldsetTokens.gap, align: .stretch, justify: .start,
                insets: EdgeInsets(top: GMFieldsetTokens.legendGap, leading: 0, bottom: 0, trailing: 0)
            ) { content }
        }
        .disabled(disabled)
        .opacity(disabled ? Self.disabledOpacity : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(legend)
    }
}
