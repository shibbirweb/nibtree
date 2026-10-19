import NibtreeTokens
import SwiftUI

/// Everything an input draws at rest, worked out once from its props as Input.svelte's classes do.
struct NInputLook: Sendable {
    /// Input.svelte's `opacity: 0.5` while disabled.
    nonisolated static let disabledOpacity = 0.5
    /// Input.svelte's `color-mix(in srgb, var(--accent) 25%, transparent)` focus ring.
    nonisolated static let ringShare = 0.25
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0
    /// WebKit's text field is as wide as 20 of its font's zeros when nothing sets its width (the `size` attribute).
    nonisolated static let defaultCharacters = 20.0
    /// The room WebKit adds to a text field's own width for the caret.
    nonisolated static let caret = 2.0

    let invalid: Bool
    let width: NControlWidth
    let placeholder: String
    let disabled: Bool
    let label: String?
    let font: NTypography.FontKey
    let line: NLineBox

    @MainActor
    init(invalid: Bool, mono: Bool, width: NControlWidth, placeholder: String, disabled: Bool, label: String?) {
        font = NTypography.FontKey(GMTextStyles.body, size: mono ? GMFontSize.small : nil, mono: mono)
        line = NTextMetrics.lineBox(font, lineHeight: nil)
        self.invalid = invalid
        self.width = width
        self.placeholder = placeholder
        self.disabled = disabled
        self.label = label
    }

    /// The width with nothing on offer: the preset's, or WebKit's 20 characters plus padding and border.
    @MainActor
    var naturalWidth: CGFloat {
        if let points = width.points {
            return points
        }
        return Self.fieldWidth(font) + 2 * (GMInputTokens.paddingX + Self.border)
    }

    /// A WebKit text field's own width in `font`: 20 zeros in its layout units (1/64 point), plus the caret's room.
    @MainActor
    static func fieldWidth(_ font: NTypography.FontKey) -> CGFloat {
        let zeros = defaultCharacters * NTextMetrics.width(of: "0", font: font, kerning: 0)
        return (zeros * layoutUnits).rounded() / layoutUnits + caret
    }

    /// WebKit's layout units per point.
    nonisolated static let layoutUnits = 64.0

    @MainActor
    func spec(_ text: String, tone: GMColorToken) -> NTextSpec {
        NTextSpec(
            text: text, font: font, kerning: 0, tabular: false, truncate: false, line: line, tone: tone, strike: false)
    }

    @MainActor
    func draw(
        value: String, focused: Bool, origin: CGPoint, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let radius = GMInputTokens.radius
        let box = CGRect(origin: .zero, size: size)
        let edge = palette.cgColor(invalid ? .danger : focused ? .accent : .borderStrong)
        if focused {
            let ring = palette.cgColor(invalid ? .danger : .accent)
            let spread = GMInputTokens.focusRing
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: -spread, dy: -spread), cornerWidth: radius + spread,
                    cornerHeight: radius + spread, transform: nil))
            cg.setFillColor(ring.copy(alpha: ring.alpha * Self.ringShare) ?? ring)
            cg.fillPath()
        }
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.addPath(outer)
        cg.setFillColor(palette.cgColor(.panel))
        cg.fillPath()
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: Self.border, dy: Self.border), cornerWidth: radius - Self.border,
                cornerHeight: radius - Self.border, transform: nil))
        cg.setFillColor(edge)
        cg.fillPath(using: .evenOdd)
        let shown = value.isEmpty ? placeholder : value
        guard !shown.isEmpty else {
            return
        }
        let room = size.width - 2 * (GMInputTokens.paddingX + Self.border)
        let layout = spec(shown, tone: .text).layout(width: nil)
        // The text box clips what does not fit, as a text field scrolls its text.
        cg.clip(to: CGRect(x: Self.border + GMInputTokens.paddingX, y: 0, width: max(0, room), height: size.height))
        cg.translateBy(
            x: origin.x - (origin.x * scale).rounded() / scale + Self.border + GMInputTokens.paddingX,
            y: origin.y - (origin.y * scale).rounded() / scale + (size.height - line.height) / 2)
        let color = value.isEmpty ? NWebKitColors.placeholder : palette.cgColor(.text)
        NTextEngine.draw(layout, line: line, color: color, strike: nil, scale: scale, in: cg)
    }
}

/// The input's box at rest: border, background, focus ring and text in one canvas.
struct NInputFace: View {
    let look: NInputLook
    let value: String
    let focused: Bool
    let state = NTextState()

    var body: some View {
        let (look, value, focused, state) = (look, value, focused, state)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    look.draw(
                        value: value, focused: focused, origin: state.origin, size: size, palette: palette,
                        scale: scale, in: cg)
                }
            }
        }
        .layoutValue(key: NInputOrigin.self, value: state)
    }
}

/// Hands the face's origin keeper to the frame, which knows where the face lands.
struct NInputOrigin: LayoutValueKey {
    static let defaultValue: NTextState? = nil
}

/// The input's size: the token height, and its preset width, the parent's (`fill`, or a column stretching it) or
/// WebKit's own; a text field while editing sits in the text's place.
struct NInputFrame: Layout {
    let look: NInputLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.naturalWidth }
        let offer = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = look.width.points ?? (look.width == .fill || offer != nil ? offer ?? natural : natural)
        return CGSize(width: width, height: GMInputTokens.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for subview in subviews {
            if let state = subview[NInputOrigin.self] {
                state.origin = bounds.origin
                subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
            } else {
                let inset = NInputLook.border + GMInputTokens.paddingX
                subview.place(
                    at: CGPoint(x: bounds.minX + inset, y: bounds.midY), anchor: .leading,
                    proposal: ProposedViewSize(width: bounds.width - 2 * inset, height: nil))
            }
        }
    }
}
