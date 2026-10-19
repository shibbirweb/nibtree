import NibtreeTokens
import SwiftUI

/// A toggle button's look: `plain` is borderless and tints when on (editor toolbars), `outline` has a border and turns
/// accent when on, `tool` is a file bar's narrow tool, `chip` a popup's filter with a check when on, `filter` a log
/// filter such as "Mine" that tints with the accent.
public enum NToggleButtonVariant: String, CaseIterable, Sendable {
    case plain, outline, tool, chip, filter
}

/// A button that stays on or off, like the diff's "Collapse unchanged" and the merge editor's options: the Swift side
/// of ui/web `ToggleButton` (docs/components/ToggleButton.md). Without `text` it is a narrow icon button and `label`
/// names it. Its tooltip (`title`, or the label) is AppKit's while the pointer is over it. One canvas draws it. The
/// web's `keepFocus` has no Swift side: a SwiftUI button does not take the focus from a field when clicked.
public struct NToggleButton: View {
    @Binding private var pressed: Bool
    private let look: NToggleButtonLook
    private let label: String
    private let title: String?
    private let disabled: Bool
    @State private var hovering = false

    public init(
        pressed: Binding<Bool>, label: String, text: String = "", icon: GMIconName? = nil,
        variant: NToggleButtonVariant = .plain, disabled: Bool = false, title: String? = nil
    ) {
        _pressed = pressed
        look = NToggleButtonLook(variant: variant, pressed: pressed.wrappedValue, icon: icon, text: text)
        self.label = label
        self.title = title
        self.disabled = disabled
    }

    public var body: some View {
        let (look, hot) = (look, hovering && !disabled)
        NToggleButtonFrame(look: look) {
            Canvas(opaque: false, rendersAsynchronously: false) { context, size in
                MainActor.assumeIsolated {
                    let palette = context.environment.nibtreePalette
                    let scale = max(1, context.environment.displayScale)
                    context.withCGContext { cg in
                        NToggleButtonFace.draw(
                            look, hovering: hot, size: size, palette: palette, scale: scale, in: cg)
                    }
                }
            }
        }
        .opacity(disabled ? NToggleButtonLook.disabledOpacity : 1)
        .onHover { inside in
            hovering = inside
            if inside {
                NHoverHelpHost.show(title ?? label)
            } else {
                NHoverHelpHost.hide(title ?? label)
            }
        }
        .onTapGesture {
            if !disabled {
                pressed.toggle()
            }
        }
        .accessibilityRepresentation {
            Toggle(look.words.text.isEmpty ? label : look.words.text, isOn: $pressed)
                .toggleStyle(.button)
                .disabled(disabled)
        }
    }
}

enum NToggleButtonFace {
    @MainActor
    static func draw(
        _ look: NToggleButtonLook, hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let colors = look.colors(hovering: hovering, palette: palette)
        let box = CGRect(origin: .zero, size: size)
        let radius = look.radius
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        if let fill = colors.fill {
            cg.addPath(outer)
            cg.setFillColor(fill)
            cg.fillPath()
        }
        if let edge = colors.edge, look.border > 0 {
            let inner = radius - look.border
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: look.border, dy: look.border), cornerWidth: inner,
                    cornerHeight: inner, transform: nil))
            cg.setFillColor(edge)
            cg.fillPath(using: .evenOdd)
        }
        let parts = look.parts
        let content = parts.reduce(0) { $0 + $1.width } + CGFloat(max(0, parts.count - 1)) * look.gap
        // A tool centers its icon; the others start after the padding.
        var x = look.variant == .tool ? (size.width - content) / 2 : look.border + look.paddingX
        let origin = look.words.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        for part in parts {
            switch part.kind {
            case .check, .icon:
                let name: GMIconName = part.kind == .check ? .check : look.icon ?? .check
                let points = part.width
                let key = NIconImages.Key(
                    name: name, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: colors.text)
                if let image = NIconImages.image(key, color: colors.text) {
                    // WebKit puts an SVG on whole device pixels.
                    let left = ((x + phase.x) * scale).rounded() / scale
                    let top = (((size.height - points) / 2 + phase.y) * scale).rounded() / scale
                    cg.saveGState()
                    cg.translateBy(x: left, y: top + points)
                    cg.scaleBy(x: 1, y: -1)
                    cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                    cg.restoreGState()
                }
            case .words:
                if let layout = look.words.state.layout {
                    cg.saveGState()
                    cg.translateBy(x: x + phase.x, y: (size.height - look.words.line.height) / 2 + phase.y)
                    NTextEngine.draw(
                        layout, line: look.words.line, color: colors.text, strike: nil, scale: scale, in: cg)
                    cg.restoreGState()
                }
            }
            x += part.width + look.gap
        }
    }
}

/// The button's own size (`flex: none`), or a column's whole width when one stretches it, its content at the start.
private struct NToggleButtonFrame: Layout {
    let look: NToggleButtonLook

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let natural = MainActor.assumeIsolated { look.size }
        guard let offer = proposal.width, offer.isFinite, look.variant != .tool else {
            return natural
        }
        return CGSize(width: max(offer, natural.width), height: natural.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        look.words.state.origin = bounds.origin
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
    }
}
