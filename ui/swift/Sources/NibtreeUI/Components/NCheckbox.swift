import NibtreeTokens
import SwiftUI

/// A checkbox with its label; clicking the label toggles it too: the Swift side of ui/web `Checkbox`
/// (docs/components/Checkbox.md). The web's is the browser's own control, so the box is drawn like WebKit's, in the
/// system accent and gray, not the theme's. `indeterminate` shows a dash whatever `checked` is. The web's `onchange` is
/// the binding's own setter, its `title` is SwiftUI's `.help` on the checkbox, and its `children` are the label view.
/// VoiceOver reads it as a checkbox and can toggle it.
public struct NCheckbox<Label: View>: View {
    public enum Size: String, CaseIterable, Sendable {
        case normal, small
    }

    @Binding private var checked: Bool
    private let indeterminate: Bool
    private let disabled: Bool
    /// The words, drawn in the box's own canvas: one view per checkbox is what keeps it faster than the web's.
    private let words: NTextSpec?
    private let label: Label
}

extension NCheckbox where Label == EmptyView {
    public init(
        checked: Binding<Bool>, indeterminate: Bool = false, label: String = "", disabled: Bool = false,
        size: Size = .normal
    ) {
        let style = GMTextStyles.body
        let font = NTypography.FontKey(style, size: size == .small ? NText.Size.small.points : nil)
        _checked = checked
        self.indeterminate = indeterminate
        self.disabled = disabled
        words = NTextSpec(
            text: label, font: font, kerning: style.letterSpacing * font.size, tabular: false, truncate: false,
            line: NTextMetrics.lineBox(font, lineHeight: style.lineHeight), tone: size == .small ? .textDim : .text,
            strike: false)
        self.label = EmptyView()
    }
}

extension NCheckbox {
    /// A label of any views, such as a mono flag name: a small checkbox's dim small words are then the caller's.
    public init(
        checked: Binding<Bool>, indeterminate: Bool = false, disabled: Bool = false,
        @ViewBuilder label: () -> Label
    ) {
        _checked = checked
        self.indeterminate = indeterminate
        self.disabled = disabled
        words = nil
        self.label = label()
    }

    public var body: some View {
        NCheckboxFrame(words: words) {
            NCheckboxBox(mark: indeterminate ? .dash : checked ? .check : nil, disabled: disabled, words: words)
            label.opacity(disabled ? NCheckboxBox.disabledOpacity : 1)
        }
        .onTapGesture(perform: flip)
        .accessibilityRepresentation {
            Toggle(isOn: $checked) {
                if let words {
                    Text(words.text)
                } else {
                    label
                }
            }
            .toggleStyle(.checkbox)
            .disabled(disabled)
        }
    }

    private func flip() {
        if disabled {
            return
        }
        checked.toggle()
    }
}

/// The label's room: the box, the web's `--space-3` gap, then the words (or the label view), centered on each other
/// like the web's `inline-flex` with `align-items: center`.
private struct NCheckboxFrame: Layout {
    let words: NTextSpec?

    static let lead = NCheckboxBox.side + GMSpace.s3

    /// The last offered width and its lines, as NText keeps them.
    struct Cache {
        var width: CGFloat?? = .none
        var layout: NTextEngine.Layout?
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    private func room(_ proposal: ProposedViewSize) -> CGFloat? {
        proposal.width.flatMap { $0.isFinite ? max(0, $0 - Self.lead) : nil }
    }

    private func lines(_ words: NTextSpec, _ width: CGFloat?, _ cache: inout Cache) -> NTextEngine.Layout {
        if case .some(let cached) = cache.width, cached == width, let layout = cache.layout {
            return layout
        }
        let layout = MainActor.assumeIsolated { words.layout(width: width) }
        cache = Cache(width: .some(width), layout: layout)
        return layout
    }

    private func label(_ proposal: ProposedViewSize, _ subviews: Subviews, _ cache: inout Cache) -> CGSize {
        let width = room(proposal)
        if let words {
            if words.text.isEmpty {
                return .zero
            }
            let layout = lines(words, width, &cache)
            return CGSize(width: layout.width, height: CGFloat(layout.lines.count) * words.line.height)
        }
        return subviews.count > 1 ? subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil)) : .zero
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let size = label(proposal, subviews, &cache)
        return CGSize(width: Self.lead + size.width, height: max(NCheckboxBox.side, size.height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        _ = label(proposal, subviews, &cache)
        if let words {
            words.state.layout = cache.layout
            words.state.origin = bounds.origin
        }
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
        if subviews.count > 1 {
            subviews[1].place(
                at: CGPoint(x: bounds.minX + Self.lead, y: bounds.midY), anchor: .leading,
                proposal: ProposedViewSize(width: room(proposal), height: nil))
        }
    }
}

/// The box as WebKit draws a checkbox on macOS: a continuous-corner square, a gray ring around the control background
/// when off, the accent fill with a white check or dash when on. The shapes are fitted to WebKit's pixels.
struct NCheckboxBox: View {
    enum Mark {
        case check, dash
    }

    let mark: Mark?
    let disabled: Bool
    let words: NTextSpec?

    /// Checkbox.svelte's `opacity: 0.5` on a disabled label; WebKit also draws a disabled box's ring, fill and mark
    /// at half strength.
    nonisolated static let disabledOpacity = 0.5
    /// WebKit's checkbox is 12 points square whatever the font, with these corners, ring and mark.
    nonisolated static let side = 12.0
    private static let radius = 4.4
    private static let ring = 1.5
    private static let ringRadius = 2.65
    private static let check = [CGPoint(x: 3.15, y: 6.49), CGPoint(x: 5.29, y: 9.04), CGPoint(x: 8.84, y: 3.58)]
    private static let checkWidth = 1.3
    private static let dash = CGSize(width: 4.85, height: 1.9)

    var body: some View {
        let (mark, disabled, words) = (mark, disabled, words)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                guard disabled else {
                    // In a disabled group (a fieldset) WebKit fades the box, but not the words.
                    let strength = context.environment.isEnabled ? 1 : Self.disabledOpacity
                    Self.draw(context, size, mark: mark, words: words, strength: strength)
                    return
                }
                // The web dims the whole label, box and words together, as one layer.
                var dimmed = context
                dimmed.opacity = Self.disabledOpacity
                dimmed.drawLayer { Self.draw($0, size, mark: mark, words: words, strength: Self.disabledOpacity) }
            }
        }
    }

    private static func draw(
        _ context: GraphicsContext, _ size: CGSize, mark: Mark?, words: NTextSpec?, strength: Double
    ) {
        let palette = context.environment.nibtreePalette
        var box = context
        box.translateBy(x: 0, y: (size.height - side) / 2)
        paint(box, NWebKitColors.colors(dark: palette.isDark), mark: mark, strength: strength)
        guard let words, let layout = words.state.layout else {
            return
        }
        let scale = max(1, context.environment.displayScale)
        let origin = words.state.origin
        let height = CGFloat(layout.lines.count) * words.line.height
        context.withCGContext { cg in
            // SwiftUI put the canvas on whole device pixels; the words sit where WebKit draws them.
            cg.translateBy(
                x: NCheckboxFrame.lead + origin.x - (origin.x * scale).rounded() / scale,
                y: (size.height - height) / 2 + origin.y - (origin.y * scale).rounded() / scale)
            NTextEngine.draw(
                layout, line: words.line, color: palette.cgColor(words.tone), strike: nil, scale: scale, in: cg)
        }
    }

    static func paint(_ context: GraphicsContext, _ colors: NWebKitColors, mark: Mark?, strength: Double) {
        let box = CGRect(x: 0, y: 0, width: side, height: side)
        let outer = RoundedRectangle(cornerRadius: radius, style: .continuous).path(in: box)
        if mark == nil || strength < 1 {
            // The control background sits half a point in, so the ring's outer edge shows the panel through it.
            let inside = RoundedRectangle(cornerRadius: radius - 0.5, style: .continuous)
            context.fill(inside.path(in: box.insetBy(dx: 0.5, dy: 0.5)), with: .color(colors.inside))
        }
        guard let mark else {
            var shape = outer
            let hole = RoundedRectangle(cornerRadius: ringRadius, style: .continuous)
            shape.addPath(hole.path(in: box.insetBy(dx: ring, dy: ring)))
            context.fill(shape, with: .color(colors.ring.opacity(strength)), style: FillStyle(eoFill: true))
            return
        }
        context.fill(outer, with: .color(colors.accent.opacity(strength)))
        let white = Color.white.opacity(strength)
        switch mark {
        case .check:
            var path = Path()
            path.addLines(check)
            let style = StrokeStyle(lineWidth: checkWidth, lineCap: .round, lineJoin: .round)
            context.stroke(path, with: .color(white), style: style)
        case .dash:
            let rect = CGRect(
                x: (side - dash.width) / 2, y: (side - dash.height) / 2, width: dash.width, height: dash.height)
            context.fill(Path(roundedRect: rect, cornerRadius: dash.height / 2), with: .color(white))
        }
    }
}
