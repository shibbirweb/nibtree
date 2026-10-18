import NibtreeTokens
import SwiftUI

/// A small rounded chip with a word or two: the Swift side of ui/web `Chip` (docs/components/Chip.md). `filter` chips
/// sum up a list and filter it (the AI panel's "2 waiting"), `pick` chips offer a value to use (font names in Settings,
/// each in its own `fontFamily`), `badge` is a small bordered fact. A `status` mark goes before the words in place of
/// `icon`. With an `action` it is a button. The web's `title` is SwiftUI's `.help` on the chip.
public struct NChip: View {
    public enum Variant: String, CaseIterable, Sendable {
        case filter, pick, badge
    }

    public enum Tone: String, CaseIterable, Sendable {
        case neutral, warning
    }

    private let look: NChipLook
    private let action: (() -> Void)?

    public init(
        _ text: String, variant: Variant = .filter, tone: Tone = .neutral, icon: GMIconName? = nil,
        status: NStatusIcon.State? = nil, fontFamily: String? = nil, action: (() -> Void)? = nil
    ) {
        look = NChipLook(
            text: text, variant: variant, tone: tone, icon: icon, status: status, fontFamily: fontFamily,
            pressable: action != nil)
        self.action = action
    }

    public var body: some View {
        if look.hovers {
            NChipHovering(look: look, action: action)
        } else {
            NChipBody(look: look, hovering: false, action: action)
        }
    }
}

/// A chip whose colors change under the pointer.
private struct NChipHovering: View {
    let look: NChipLook
    let action: (() -> Void)?
    @State private var hovering = false

    var body: some View {
        NChipBody(look: look, hovering: hovering, action: action).onHover { hovering = $0 }
    }
}

private struct NChipBody: View {
    let look: NChipLook
    let hovering: Bool
    let action: (() -> Void)?

    var body: some View {
        NChipFrame(look: look) {
            NChipFace(look: look, hovering: hovering)
            if let status = look.status {
                NStatusIcon(state: status, label: look.words.text)
            }
        }
        .onTapGesture { action?() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(look.words.text)
        .accessibilityAddTraits(action == nil ? [] : .isButton)
    }
}

/// The border, background, icon and words in one canvas.
private struct NChipFace: View {
    let look: NChipLook
    let hovering: Bool

    var body: some View {
        let (look, hovering) = (look, hovering)
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            MainActor.assumeIsolated {
                let palette = context.environment.nibtreePalette
                let scale = max(1, context.environment.displayScale)
                context.withCGContext { cg in
                    Self.frame(look, hovering: hovering, size: size, palette: palette, in: cg)
                    Self.content(look, hovering: hovering, size: size, palette: palette, scale: scale, in: cg)
                }
            }
        }
    }

    private static func frame(_ look: NChipLook, hovering: Bool, size: CGSize, palette: Palette, in cg: CGContext) {
        let box = CGRect(origin: .zero, size: size)
        // CSS shrinks corners that do not fit, as a pick's 12-point ones on a shorter chip.
        let radius = min(look.radius, size.height / 2, size.width / 2)
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        if let background = hovering ? look.hoverBackground ?? look.background : look.background {
            cg.addPath(outer)
            cg.setFillColor(background.cgColor(palette))
            cg.fillPath()
        }
        let width = NChipLook.cssBorder
        let inner = max(0, radius - width)
        cg.addPath(outer)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: width, dy: width), cornerWidth: inner, cornerHeight: inner,
                transform: nil))
        cg.setFillColor((hovering ? look.hoverBorder ?? look.border : look.border).cgColor(palette))
        cg.fillPath(using: .evenOdd)
    }

    @MainActor
    private static func content(
        _ look: NChipLook, hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let color = palette.cgColor(hovering ? look.hoverText ?? look.text : look.text)
        let origin = look.words.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        if look.status == nil, let icon = look.icon {
            let points = NIconSize.small.points
            let key = NIconImages.Key(
                name: icon, points: points, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
            if let image = NIconImages.image(key, color: color) {
                // WebKit puts an SVG on whole device pixels.
                let x = ((NChipLook.cssBorder + look.paddingLeft + phase.x) * scale).rounded() / scale
                let y = (((size.height - points) / 2 + phase.y) * scale).rounded() / scale
                cg.saveGState()
                cg.translateBy(x: x, y: y + points)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(x: 0, y: 0, width: points, height: points))
                cg.restoreGState()
            }
        }
        guard let layout = look.words.state.layout, !look.words.text.isEmpty else {
            return
        }
        cg.translateBy(x: look.wordsLeft + phase.x, y: (size.height - look.words.line.height) / 2 + phase.y)
        NTextEngine.draw(layout, line: look.words.line, color: color, strike: nil, scale: scale, in: cg)
    }
}
