import NibtreeTokens
import SwiftUI

/// A floating box: the panel color in a rounded rectangle with a 1 point strong border and the popup shadow
/// (`--shadow`), like a floating Navigation Bar, a drag ghost or a corner card. Drawn in a canvas larger than the box
/// by the shadow's reach, so the shadow is not cut off; put it behind the content with `.background`.
struct NPopupBox: View {
    /// How far the shadow reaches past the box.
    nonisolated static let reach = GMShadows.popup.blur + abs(GMShadows.popup.y)
    /// The CSS `1px solid` border.
    nonisolated static let border = 1.0

    let radius: CGFloat

    var body: some View {
        let radius = radius
        Canvas(opaque: false, rendersAsynchronously: false) { context, size in
            let palette = context.environment.nibtreePalette
            let reach = Self.reach
            let box = CGRect(x: reach, y: reach, width: size.width - 2 * reach, height: size.height - 2 * reach)
            context.withCGContext { cg in
                Self.draw(box, radius: radius, palette: palette, in: cg)
            }
        }
        .padding(-Self.reach)
    }

    /// The shadow, the panel color and the border of a box at `box`, for a canvas that draws more on top.
    static func draw(_ box: CGRect, radius: CGFloat, palette: Palette, in cg: CGContext) {
        let shadow = GMShadows.popup
        let shade = palette.isDark ? shadow.dark : shadow.light
        let outline = CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil)
        cg.saveGState()
        cg.setShadow(
            offset: CGSize(width: shadow.x, height: shadow.y), blur: shadow.blur,
            color: CGColor(
                srgbRed: shade.red / 255, green: shade.green / 255, blue: shade.blue / 255, alpha: shade.alpha))
        cg.addPath(outline)
        cg.setFillColor(palette.cgColor(.panel))
        cg.fillPath()
        cg.restoreGState()
        let inner = radius - border
        cg.addPath(outline)
        cg.addPath(
            CGPath(
                roundedRect: box.insetBy(dx: border, dy: border), cornerWidth: inner, cornerHeight: inner,
                transform: nil))
        cg.setFillColor(palette.cgColor(.borderStrong))
        cg.fillPath(using: .evenOdd)
    }
}
