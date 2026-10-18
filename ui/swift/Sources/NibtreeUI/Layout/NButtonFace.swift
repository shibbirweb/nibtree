import NibtreeTokens
import SwiftUI

/// The button drawn in one canvas: its background and border, the icon, words, count and trailing icon where
/// `NButtonFrame` put them. A label view and a spinning icon are drawn by their own views instead.
struct NButtonFace: View {
    let look: NButtonLook
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

    /// The background under the whole box and the border over its edge, as CSS paints them.
    private static func frame(
        _ look: NButtonLook, hovering: Bool, size: CGSize, palette: Palette, in cg: CGContext
    ) {
        let radius = look.radius
        let box = CGRect(origin: .zero, size: size)
        let outer = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        let resting = look.pressed ? look.colors.pressedBackground : look.colors.background
        let background = hovering ? look.colors.hover : resting
        if let background {
            cg.addPath(outer)
            cg.setFillColor(palette.cgColor(background))
            cg.fillPath()
        }
        if let border = look.colors.border, look.border > 0 {
            let width = look.border
            let inner = radius - width
            cg.addPath(outer)
            cg.addPath(
                CGPath(
                    roundedRect: box.insetBy(dx: width, dy: width), cornerWidth: inner, cornerHeight: inner,
                    transform: nil))
            cg.setFillColor(palette.cgColor(border))
            cg.fillPath(using: .evenOdd)
        }
    }

    private static func content(
        _ look: NButtonLook, hovering: Bool, size: CGSize, palette: Palette, scale: CGFloat, in cg: CGContext
    ) {
        let parts = look.placed.parts
        let left = look.placed.left
        let color = palette.cgColor(hovering ? look.colors.hoverText ?? look.colors.text : look.colors.text)
        let origin = look.words.state.origin
        let phase = CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
        // WebKit puts an SVG on whole device pixels: the icon's spot on the page, rounded, less the canvas's own.
        func snapped(_ x: CGFloat) -> CGFloat { ((x + phase.x) * scale).rounded() / scale }
        if let points = look.leadPoints, !look.spinning {
            let spot = CGRect(
                x: snapped(left + parts.lead), y: (size.height - points) / 2, width: points, height: points)
            let image: CGImage? = if let kind = look.layout {
                NLayoutIconImages.image(
                    NLayoutIconImages.Key(
                        kind: kind, active: look.layoutActive, points: points, scale: scale,
                        rgba: NIconImages.Key.pack(color)),
                    color: color)
            } else if let icon = look.icon {
                glyph(icon, points: points, scale: scale, color: color)
            } else {
                nil
            }
            draw(image, in: spot, cg)
        }
        if !look.labelled, !look.words.text.isEmpty {
            text(look.words, x: left + parts.words, size: size, phase: phase, color: color, scale: scale, in: cg)
        }
        if let count = look.count {
            let tone = look.countFollowsText ? color : palette.cgColor(count.tone)
            text(count, x: left + parts.count, size: size, phase: phase, color: tone, scale: scale, in: cg)
        }
        if let trailing = look.trailingIcon {
            let points = NIconSize.compact.points
            let spot = CGRect(
                x: snapped(left + parts.trailing), y: (size.height - points) / 2, width: points, height: points)
            draw(glyph(trailing, points: points, scale: scale, color: color), in: spot, cg)
        }
    }

    private static func glyph(_ name: GMIconName, points: CGFloat, scale: CGFloat, color: CGColor) -> CGImage? {
        let lineWidth = name == .more ? GMIconStroke.heavy : NIconStroke.normal.width
        let key = NIconImages.Key(name: name, points: points, lineWidth: lineWidth, scale: scale, color: color)
        return NIconImages.image(key, color: color)
    }

    /// A bitmap's y runs up, the canvas's down.
    private static func draw(_ image: CGImage?, in spot: CGRect, _ cg: CGContext) {
        guard let image else {
            return
        }
        cg.saveGState()
        cg.translateBy(x: spot.minX, y: spot.maxY)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(origin: .zero, size: spot.size))
        cg.restoreGState()
    }

    @MainActor
    private static func text(
        _ spec: NTextSpec, x: CGFloat, size: CGSize, phase: CGPoint, color: CGColor, scale: CGFloat,
        in cg: CGContext
    ) {
        let layout = NButtonLook.lines(spec)
        cg.saveGState()
        cg.translateBy(x: x + phase.x, y: (size.height - spec.line.height) / 2 + phase.y)
        NTextEngine.draw(layout, line: spec.line, color: color, strike: nil, scale: scale, in: cg)
        cg.restoreGState()
    }
}
