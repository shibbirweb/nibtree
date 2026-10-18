import NibtreeTokens
import SwiftUI

/// Draws the bar's crumbs and separators where `NBreadcrumbsFrame` put them.
@MainActor
struct NBreadcrumbsPaint {
    let look: NBreadcrumbsLook
    let hovered: Int?
    let size: CGSize
    let palette: Palette
    let scale: CGFloat

    private var phase: CGPoint {
        let origin = look.placed.origin
        return CGPoint(
            x: origin.x - (origin.x * scale).rounded() / scale, y: origin.y - (origin.y * scale).rounded() / scale)
    }

    /// WebKit puts an SVG on whole device pixels.
    private func snap(_ value: CGFloat) -> CGFloat { (value * scale).rounded() / scale }

    func draw(in cg: CGContext) {
        let phase = phase
        let top = (size.height - GMBreadcrumbsTokens.height) / 2
        let faint = palette.cgColor(.textFaint)
        let points = NBreadcrumbsLook.separator
        for x in look.placed.separators {
            let spot = CGRect(
                x: snap(x + phase.x), y: snap((size.height - points) / 2 + phase.y), width: points, height: points)
            glyph(.chevronRight, color: faint, in: spot, cg)
        }
        for (index, place) in look.placed.crumbs.enumerated() where index < look.crumbs.count {
            let lit = look.open == index || hovered == index
            if lit {
                let radius = GMBreadcrumbsTokens.radius
                let box = CGRect(x: place.x, y: top, width: place.width, height: GMBreadcrumbsTokens.height)
                cg.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
                cg.setFillColor(palette.cgColor(look.open == index ? .selected : .hover))
                cg.fillPath()
            }
            let color = palette.cgColor(lit ? .text : look.names[index].tone)
            crumb(index, x: place.x, width: place.width, color: color, phase: phase, in: cg)
        }
    }

    private func crumb(
        _ index: Int, x: CGFloat, width: CGFloat, color: CGColor, phase: CGPoint, in cg: CGContext
    ) {
        cg.saveGState()
        // A crumb's own `overflow: hidden`.
        cg.clip(to: CGRect(x: x, y: 0, width: width, height: size.height))
        if let lead = look.crumbs[index].lead {
            let points = NBreadcrumbsLook.lead
            let spot = CGRect(
                x: snap(x + GMBreadcrumbsTokens.paddingX + phase.x), y: snap((size.height - points) / 2 + phase.y),
                width: points, height: points)
            switch lead {
            case .icon(let name):
                glyph(name, color: color, in: spot, cg)
            case .file(let view?):
                let tint: CGColor? = if case .mask(_, let tone) = view { palette.cgColor(tone) } else { nil }
                bitmap(NFileIconImages.image(view, points: points, scale: scale, color: tint), in: spot, cg)
            case .file(nil):
                glyph(.file, color: color, in: spot, cg)
            }
        }
        let spec = look.names[index]
        let left = look.nameLeft(index)
        let room = max(0, width - left - GMBreadcrumbsTokens.paddingX)
        let layout = NTextEngine.layout(
            spec.text, font: spec.font, kerning: 0, tabular: false, truncate: true, width: room)
        // The name's own `overflow: hidden` clips an ellipsis that does not fit.
        cg.clip(to: CGRect(x: x + left, y: 0, width: room, height: size.height))
        cg.translateBy(x: x + left + phase.x, y: (size.height - spec.line.height) / 2 + phase.y)
        NTextEngine.draw(layout, line: spec.line, color: color, strike: nil, scale: scale, in: cg)
        cg.restoreGState()
    }

    private func glyph(_ name: GMIconName, color: CGColor, in spot: CGRect, _ cg: CGContext) {
        let key = NIconImages.Key(
            name: name, points: spot.width, lineWidth: NIconStroke.normal.width, scale: scale, color: color)
        bitmap(NIconImages.image(key, color: color), in: spot, cg)
    }

    /// A bitmap's y runs up, the canvas's down.
    private func bitmap(_ image: CGImage?, in spot: CGRect, _ cg: CGContext) {
        guard let image else {
            return
        }
        cg.saveGState()
        cg.translateBy(x: spot.minX, y: spot.maxY)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(origin: .zero, size: spot.size))
        cg.restoreGState()
    }
}
