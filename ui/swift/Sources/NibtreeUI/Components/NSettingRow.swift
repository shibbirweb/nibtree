import NibtreeTokens
import SwiftUI

/// A Settings row: the title and hint on the left, the control on the right (or under them when `stacked`): the Swift
/// side of ui/web `SettingRow` (docs/components/SettingRow.md). `titleMatches` marks the words a search found in the
/// title; a hint's `backtick` words are drawn mono. `nested` belongs to the setting above it (the web's indent for it
/// is reset by its own row padding, so neither side indents yet), `plain` has no line and
/// a regular title (the welcome screen's Customize page). With `onToggle` the whole row is its switch's label: a click
/// on the words calls it. One canvas draws the label and the line; the control is the caller's view. The web's `mark`
/// and `hintContent` snippets follow with the screens that use them.
public struct NSettingRow<Control: View>: View {
    private let look: NSettingRowLook
    private let onToggle: (() -> Void)?
    private let control: Control

    public init(
        title: String, titleMatches: [Range<Int>] = [], hint: String = "", stacked: Bool = false,
        nested: Bool = false, plain: Bool = false, onToggle: (() -> Void)? = nil,
        @ViewBuilder control: () -> Control
    ) {
        look = NSettingRowLook(
            title: title, matches: titleMatches, hint: hint, stacked: stacked, nested: nested, plain: plain)
        self.onToggle = onToggle
        self.control = control()
    }

    public var body: some View {
        let look = look
        NSettingRowLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
            .onTapGesture { onToggle?() }
            control
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(look.title.value.string)
    }
}

/// The row: padding (and a nested row's indent), the label and the control side by side (the label giving way) or
/// the control under the label; the face, under everything, also carries the line.
private struct NSettingRowLayout: Layout {
    let look: NSettingRowLook

    /// None: SettingRow.svelte's `.row` padding comes after `.nested`'s and resets it, so the web shows no indent.
    private var indent: CGFloat { 0 }
    private var paddingY: CGFloat { look.plain ? 0 : GMSettingRowTokens.paddingY }
    private var line: CGFloat { look.plain ? 0 : 1 }

    private func control(_ subviews: Subviews, width: CGFloat?) -> CGSize {
        let controls = subviews.dropFirst()
        if look.stacked {
            let sizes = controls.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
            return CGSize(width: width ?? sizes.map(\.width).max() ?? 0, height: sizes.reduce(0) { $0 + $1.height })
        }
        let sizes = controls.map { $0.sizeThatFits(.unspecified) }
        return CGSize(width: sizes.reduce(0) { $0 + $1.width }, height: sizes.map(\.height).max() ?? 0)
    }

    private func measure(_ subviews: Subviews, width: CGFloat?) -> (label: CGSize, control: CGSize, height: CGFloat) {
        let inner = width.map { $0 - indent }
        if look.stacked {
            let label = look.label(width: inner).size
            let control = control(subviews, width: inner)
            let content = label.height + (subviews.count > 1 ? GMSettingRowTokens.stackedGap + control.height : 0)
            return (label, control, content)
        }
        let control = control(subviews, width: nil)
        let room = inner.map { max(0, $0 - control.width - (control.width > 0 ? GMSettingRowTokens.gap : 0)) }
        let natural = look.label(width: nil).size
        let label = room.map { natural.width <= $0 ? natural : look.label(width: $0).size } ?? natural
        return (label, control, max(label.height, control.height))
    }

    private func height(_ content: CGFloat) -> CGFloat {
        let natural = content + 2 * paddingY + line
        return look.plain ? max(GMSettingRowTokens.plainMinHeight, natural) : natural
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let measured = measure(subviews, width: width)
        let natural = indent + measured.label.width + measured.control.width + GMSettingRowTokens.gap
        return CGSize(width: width ?? natural, height: height(measured.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let measured = measure(subviews, width: bounds.width)
        let content = bounds.height - 2 * paddingY - line
        let top = paddingY + (look.stacked ? 0 : (content - measured.label.height) / 2)
        let lines = look.label(width: look.stacked || measured.label.width < look.label(width: nil).size.width
            ? measured.label.width : nil)
        look.placed.title = lines.title
        look.placed.hint = lines.hint
        look.placed.label = CGPoint(x: indent, y: top)
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        if look.stacked {
            var y = bounds.minY + paddingY + measured.label.height + GMSettingRowTokens.stackedGap
            for control in subviews.dropFirst() {
                let size = control.sizeThatFits(ProposedViewSize(width: bounds.width - indent, height: nil))
                control.place(
                    at: CGPoint(x: bounds.minX + indent, y: y), anchor: .topLeading,
                    proposal: ProposedViewSize(width: bounds.width - indent, height: size.height))
                y += size.height
            }
            return
        }
        // `justify-content: space-between`: the control at the end, centered on the row.
        var x = bounds.maxX - measured.control.width
        for control in subviews.dropFirst() {
            let size = control.sizeThatFits(.unspecified)
            control.place(
                at: CGPoint(x: x, y: bounds.minY + paddingY + (content - size.height) / 2), anchor: .topLeading,
                proposal: ProposedViewSize(size))
            x += size.width
        }
    }
}
