import NibtreeTokens
import SwiftUI

/// Where a toolbar sits, which picks its size, padding, line and fill: a tab's top bar, a panel's bar, the diff
/// editor's bar, the bar above a file (`file`) or the terminal panel's head (`compact`), the log's bar, a filter row,
/// the merge editor's bar and footer, a dialog's filter bar, a pane's bar inside a dialog, a pane's head (`head`), a
/// popup's head (`popup`), a vertical column of tools (`rail`), the tinted bar of a file with conflicts (`conflict`),
/// a file bar along the bottom (`strip`), a panel's filter row with a line (`search`) or a dialog's footer.
public enum NToolbarVariant: String, CaseIterable, Sendable {
    case tab, panel, editor, file, compact, log, filter, merge, footer, dialog, pane, head, popup, rail, conflict
    case strip, search
    case dialogFooter = "dialog-footer"
}

/// Which edge of its view a toolbar is on: `bottom` puts its line on top.
public enum NToolbarPlacement: String, CaseIterable, Sendable {
    case top, bottom
}

/// A row of controls along a view's edge: the Swift side of ui/web `Toolbar` (docs/components/Toolbar.md). The content
/// sits at the start, `end` at the far end. Vertical `NDivider`s inside take the toolbar's length and room, and icons
/// with no tone of their own take its color (an `NText` keeps its own, as the web's Text does). One layout (a stack's)
/// places the children; one canvas behind them draws the fill and the line. `label` is what VoiceOver calls it.
/// `responsive` follows with `hideAt` and `dotAt` on Text, Badge and Divider.
public struct NToolbar<Content: View, End: View>: View {
    private let look: NToolbarLook
    private let label: String
    private let content: Content
    private let end: End

    public init(
        variant: NToolbarVariant = .tab, label: String, placement: NToolbarPlacement = .top,
        @ViewBuilder content: () -> Content, @ViewBuilder end: () -> End
    ) {
        look = NToolbarLook(variant: variant, placement: placement)
        self.label = label
        self.content = content()
        self.end = end()
    }

    public var body: some View {
        let look = look
        children
            .background {
                if look.draws {
                    Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                        MainActor.assumeIsolated {
                            let palette = context.environment.nibtreePalette
                            context.withCGContext { cg in
                                look.draw(size: size, palette: palette, in: cg)
                            }
                        }
                    }
                }
            }
            .environment(\.nibtreeDividerMetrics, look.dividers)
            .modifier(NToolbarTone(tone: look.tone))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
    }

    @ViewBuilder
    private var children: some View {
        let ends = End.self != EmptyView.self
        if look.variant == .conflict {
            NToolbarWrap(look: look) {
                content
                if ends {
                    NSpacer()
                    end
                }
            }
        } else {
            let layout = NStackLayout(
                axis: look.variant == .rail ? .vertical : .horizontal, spacing: look.gap, align: .center,
                justify: .start, insets: look.insets, height: look.height, minHeight: look.minHeight,
                width: look.width)
            layout {
                content
                if ends {
                    NSpacer()
                    end
                }
            }
        }
    }
}

extension NToolbar where End == EmptyView {
    /// A toolbar with its controls at the start only.
    public init(
        variant: NToolbarVariant = .tab, label: String, placement: NToolbarPlacement = .top,
        @ViewBuilder content: () -> Content
    ) {
        self.init(variant: variant, label: label, placement: placement, content: content) { EmptyView() }
    }
}

/// The color words in the bar take, set only for the bars that have one of their own.
private struct NToolbarTone: ViewModifier {
    let tone: GMColorToken?

    func body(content: Content) -> some View {
        if let tone {
            content.environment(\.nibtreeCurrentColor, tone)
        } else {
            content
        }
    }
}

/// The conflict bar's row, which wraps onto more lines when its controls do not fit (`flex-wrap: wrap`): each line
/// centers its children, a growing child (the spacer before `end`) takes what its line leaves.
private struct NToolbarWrap: Layout {
    let look: NToolbarLook

    private struct Line {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func lines(_ subviews: Subviews, room: CGFloat) -> [Line] {
        var lines: [Line] = [Line()]
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let added = (lines[lines.count - 1].indices.isEmpty ? 0 : look.gap) + size.width
            if !lines[lines.count - 1].indices.isEmpty, lines[lines.count - 1].width + added > room {
                lines.append(Line())
            }
            let last = lines.count - 1
            lines[last].width += (lines[last].indices.isEmpty ? 0 : look.gap) + size.width
            lines[last].height = max(lines[last].height, size.height)
            lines[last].indices.append(index)
        }
        return lines
    }

    private func room(_ width: CGFloat?) -> CGFloat {
        (width ?? .infinity) - look.insets.leading - look.insets.trailing
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let found = lines(subviews, room: room(proposal.width))
        let content = found.reduce(0) { $0 + $1.height } + CGFloat(max(0, found.count - 1)) * look.rowGap
        let height = max(look.minHeight ?? 0, content + look.insets.top + look.insets.bottom)
        let natural = (found.map(\.width).max() ?? 0) + look.insets.leading + look.insets.trailing
        return CGSize(width: proposal.width ?? natural, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let found = lines(subviews, room: room(bounds.width))
        let content = found.reduce(0) { $0 + $1.height } + CGFloat(max(0, found.count - 1)) * look.rowGap
        let inner = bounds.height - look.insets.top - look.insets.bottom
        // `align-content: normal` stretches the lines: each gets an even share of the room left over.
        let extra = found.isEmpty ? 0 : max(0, inner - content) / CGFloat(found.count)
        var y = bounds.minY + look.insets.top
        for line in found {
            let height = line.height + extra
            let free = max(0, room(bounds.width) - line.width)
            var x = bounds.minX + look.insets.leading
            for index in line.indices {
                let subview = subviews[index]
                var size = subview.sizeThatFits(.unspecified)
                if subview[NStackGrows.self] {
                    size.width += free
                }
                subview.place(
                    at: CGPoint(x: x, y: y + height / 2), anchor: .leading, proposal: ProposedViewSize(size))
                x += size.width + look.gap
            }
            y += height + look.rowGap
        }
    }
}
