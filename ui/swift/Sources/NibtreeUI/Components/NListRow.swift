import NibtreeTokens
import SwiftUI

/// A row of a pick or command list: a label with a dim description after it: the Swift side of ui/web `ListRow`
/// (docs/components/ListRow.md). The highlighted row (keyboard or pointer) is filled with the accent color, like quick
/// pick rows. As wide as its list; when it is narrow, the label and the description both give up width and end in an
/// ellipsis. One canvas draws the fill, icon and words; `trailing` views sit at the end.
public struct NListRow<Trailing: View>: View {
    private let look: NListRowLook
    private let action: (() -> Void)?
    private let onHover: (() -> Void)?
    private let trailing: Trailing

    public init(
        label: String, description: String = "", icon: GMIconName? = nil, highlighted: Bool = false,
        disabled: Bool = false, action: (() -> Void)? = nil, onHover: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) {
        look = NListRowLook(
            label: label, description: description, icon: icon, highlighted: highlighted, disabled: disabled)
        self.action = action
        self.onHover = onHover
        self.trailing = trailing()
    }

    public var body: some View {
        let look = look
        NListRowLayout(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        look.draw(size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
            trailing
                .environment(\.nibtreeCurrentColor, look.highlighted ? .accentText : .text)
        }
        .opacity(look.disabled ? NListRowLook.disabledOpacity : 1)
        .onContinuousHover { phase in
            if case .active = phase, !look.disabled {
                onHover?()
            }
        }
        .onTapGesture {
            if !look.disabled {
                action?()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(look.highlighted ? [.isButton, .isSelected] : .isButton)
    }
}

extension NListRow where Trailing == EmptyView {
    /// A row with no trailing views.
    public init(
        label: String, description: String = "", icon: GMIconName? = nil, highlighted: Bool = false,
        disabled: Bool = false, action: (() -> Void)? = nil, onHover: (() -> Void)? = nil
    ) {
        self.init(
            label: label, description: description, icon: icon, highlighted: highlighted, disabled: disabled,
            action: action, onHover: onHover) { EmptyView() }
    }
}

/// Everything a list row draws, from ListRow.svelte's classes.
struct NListRowLook: Sendable {
    /// ListRow.svelte's `opacity: 0.45` while disabled, and a highlighted description's `opacity: 0.8`.
    nonisolated static let disabledOpacity = 0.45
    nonisolated static let highlightedNoteShare = 0.8

    let label: NTextSpec
    let note: NTextSpec?
    let icon: GMIconName?
    let highlighted: Bool
    let disabled: Bool
    let placed = NListRowPlaced()

    @MainActor
    init(label: String, description: String, icon: GMIconName?, highlighted: Bool, disabled: Bool) {
        let spec = { (text: String, font: NTypography.FontKey, tone: GMColorToken) in
            NTextSpec(
                text: text, font: font, kerning: 0, tabular: false, truncate: true,
                line: NTextMetrics.lineBox(font, lineHeight: nil), tone: tone, strike: false)
        }
        self.label = spec(label, NTypography.FontKey(GMTextStyles.body), .text)
        note =
            description.isEmpty
            ? nil
            : spec(description, NTypography.FontKey(GMTextStyles.body, size: GMFontSize.small), .textFaint)
        self.icon = icon
        self.highlighted = highlighted
        self.disabled = disabled
    }

    /// The tallest line's part above its baseline, the deepest below it: the words' line, as they share a baseline.
    var above: CGFloat { max(label.line.baseline, note?.line.baseline ?? 0) }
    var below: CGFloat {
        max(label.line.height - label.line.baseline, note.map { $0.line.height - $0.line.baseline } ?? 0)
    }

    @MainActor
    func draw(size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext) {
        if highlighted {
            let radius = GMListRowTokens.radius
            cg.addPath(
                CGPath(
                    roundedRect: CGRect(origin: .zero, size: size), cornerWidth: radius, cornerHeight: radius,
                    transform: nil))
            cg.setFillColor(palette.cgColor(.accent))
            cg.fillPath()
        }
        let origin = placed.origin
        let pixel = { (value: CGFloat) in (value * scale).rounded() / scale }
        let phase = CGPoint(x: origin.x - pixel(origin.x), y: origin.y - pixel(origin.y))
        let text = palette.cgColor(highlighted ? .accentText : .text)
        if let icon {
            let points = NIconSize.normal.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: text)
            if let image = NIconImages.image(key, color: text) {
                // The icon is centered on the row (`align-self: center`), on whole device pixels.
                let x = pixel(GMListRowTokens.paddingX + phase.x)
                let y = pixel((size.height - points) / 2 + phase.y)
                cg.saveGState()
                cg.translateBy(x: x, y: y + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        let baseline = placed.baseline
        let note = highlighted ? text.copy(alpha: text.alpha * Self.highlightedNoteShare) ?? text : nil
        for (spec, x, color) in [(label, placed.labelLeft, text), (self.note, placed.noteLeft, note)] {
            guard let spec, let layout = spec.state.layout else {
                continue
            }
            cg.saveGState()
            cg.translateBy(x: x + phase.x, y: baseline - spec.line.baseline + phase.y)
            NTextEngine.draw(
                layout, line: spec.line, color: color ?? palette.cgColor(spec.tone), strike: nil, scale: scale,
                in: cg)
            cg.restoreGState()
        }
    }
}

/// Where the words went, set by the layout.
final class NListRowPlaced: @unchecked Sendable {
    var origin = CGPoint.zero
    var labelLeft: CGFloat = 0
    var noteLeft: CGFloat = 0
    var baseline: CGFloat = 0
}

/// The row's flex line: the icon, the label and description (shrinking alike when the row is narrow), and the
/// trailing views at the end, all on the words' baseline; the face under everything.
private struct NListRowLayout: Layout {
    let look: NListRowLook

    @MainActor
    private func widths(
        _ subviews: Subviews, width: CGFloat?
    ) -> (label: CGFloat, note: CGFloat, trailing: CGFloat) {
        let label = look.label.layout(width: nil).width
        let note = look.note?.layout(width: nil).width ?? 0
        let trailing = subviews.dropFirst().reduce(0) { $0 + $1.sizeThatFits(.unspecified).width }
        let items = 1 + (look.icon == nil ? 0 : 1) + (look.note == nil ? 0 : 1) + (trailing > 0 ? 1 : 0)
        let fixed = (look.icon == nil ? 0 : NIconSize.normal.points) + trailing
            + CGFloat(items - 1) * GMListRowTokens.gap + 2 * GMListRowTokens.paddingX
        guard let width else {
            return (label, note, trailing)
        }
        let shares = NCrumbMath.widths(
            basis: [label, note], least: [0, 0], shrink: [1, 1], available: width - fixed)
        return (shares[0], shares[1], trailing)
    }

    /// The shared baseline's room above and below: the words' and the trailing views' (a shortcut's key cap).
    private func line(_ subviews: Subviews) -> (above: CGFloat, below: CGFloat) {
        var (above, below) = (look.above, look.below)
        for subview in subviews.dropFirst() {
            let dimensions = subview.dimensions(in: .unspecified)
            let base = dimensions[VerticalAlignment.firstTextBaseline]
            above = max(above, base)
            below = max(below, dimensions.height - base)
        }
        return (above, below)
    }

    private func height(_ subviews: Subviews) -> CGFloat {
        let line = line(subviews)
        let icon = look.icon == nil ? 0 : NIconSize.normal.points
        return max(line.above + line.below, icon) + 2 * GMListRowTokens.paddingY
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let natural = MainActor.assumeIsolated {
            let parts = widths(subviews, width: nil)
            let items = 1 + (look.icon == nil ? 0 : 1) + (look.note == nil ? 0 : 1) + (parts.trailing > 0 ? 1 : 0)
            return parts.label + parts.note + parts.trailing + (look.icon == nil ? 0 : NIconSize.normal.points)
                + CGFloat(items - 1) * GMListRowTokens.gap + 2 * GMListRowTokens.paddingX
        }
        return CGSize(width: width ?? natural, height: height(subviews))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        MainActor.assumeIsolated {
            let parts = widths(subviews, width: bounds.width)
            let natural = look.label.layout(width: nil)
            let fits = natural.width <= parts.label + 0.01
            look.label.state.layout = fits ? natural : look.label.layout(width: parts.label)
            if let note = look.note {
                let full = note.layout(width: nil)
                note.state.layout = full.width <= parts.note + 0.01 ? full : note.layout(width: parts.note)
            }
            var x = GMListRowTokens.paddingX + (look.icon == nil ? 0 : NIconSize.normal.points + GMListRowTokens.gap)
            look.placed.labelLeft = x
            x += parts.label + GMListRowTokens.gap
            look.placed.noteLeft = x
        }
        look.placed.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        // `margin-left: auto`: the trailing views at the end, on the words' baseline.
        var end = bounds.maxX - GMListRowTokens.paddingX
        let above = line(subviews).above
        look.placed.baseline = GMListRowTokens.paddingY + above
        let baseline = bounds.minY + look.placed.baseline
        for subview in subviews.dropFirst().reversed() {
            let size = subview.sizeThatFits(.unspecified)
            let base = subview.dimensions(in: .unspecified)[VerticalAlignment.firstTextBaseline]
            end -= size.width
            subview.place(
                at: CGPoint(x: end, y: baseline - base), anchor: .topLeading, proposal: ProposedViewSize(size))
        }
    }
}
